import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { conversationsStorePath } from '../main/workspace/workspace-service';
import { dedupeStoredToolMessages } from './dedupe-tool-messages';

/** 同一路径串行写盘，避免并发 normalize 时 Windows 上 rename EPERM。 */
const writeTailByTarget = new Map<string, Promise<void>>();

function enqueueSerializedWrite<T>(targetPath: string, task: () => Promise<T>): Promise<T> {
  const key = path.resolve(targetPath).toLowerCase();
  const prev = writeTailByTarget.get(key) ?? Promise.resolve();
  const run = prev.catch(() => undefined).then(task);
  writeTailByTarget.set(
    key,
    run.then(
      () => undefined,
      () => undefined
    )
  );
  return run;
}

async function atomicWriteUtf8File(targetPath: string, data: string): Promise<void> {
  const dir = path.dirname(targetPath);
  await fs.promises.mkdir(dir, { recursive: true });
  const tmp = path.join(
    dir,
    `.${path.basename(targetPath)}.${process.pid}.${randomUUID().slice(0, 8)}.tmp`
  );
  await fs.promises.writeFile(tmp, data, 'utf-8');

  const finish = async (): Promise<void> => {
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        await fs.promises.rename(tmp, targetPath);
        return;
      } catch (e: unknown) {
        const code = e && typeof e === 'object' ? String((e as NodeJS.ErrnoException).code ?? '') : '';
        if (attempt < 4 && (code === 'EPERM' || code === 'EACCES' || code === 'EBUSY')) {
          await new Promise((r) => setTimeout(r, 50 * (attempt + 1)));
          continue;
        }
        if (code === 'EPERM' || code === 'EACCES' || code === 'EBUSY' || code === 'EXDEV') {
          await fs.promises.writeFile(targetPath, data, 'utf-8');
          await fs.promises.unlink(tmp).catch(() => undefined);
          return;
        }
        await fs.promises.unlink(tmp).catch(() => undefined);
        throw e;
      }
    }
  };

  await finish();
}

export type StoredMessageRole = 'user' | 'assistant' | 'tool';

export type StoredToolCall = {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
};

export type StoredMessage = {
  id: string;
  role: StoredMessageRole;
  content: string;
  timestamp: number;
  /** 前端写入的对话气泡渠道（persist 后与 chatStore.channel 对齐） */
  channel?: string;
  // Provider-specific fields (optional; used by the new engine)
  reasoning_content?: string;
  tool_calls?: StoredToolCall[];
  tool_call_id?: string;
  name?: string;
  meta?: Record<string, unknown>;
};

export type StoredConversation = {
  id: string;
  title: string;
  messages: StoredMessage[];
  createdAt: number;
  updatedAt: number;
  meta?: Record<string, unknown>;
};

type StorePayload = { conversations: StoredConversation[] };

export class SessionStore {
  constructor(private readonly workspaceRoot: string) {}

  /** 落盘路径对应的工作区根（解析后绝对路径） */
  resolvedWorkspaceRoot(): string {
    return path.resolve(this.workspaceRoot);
  }

  private get storePath(): string {
    return conversationsStorePath(this.workspaceRoot);
  }

  async readAll(): Promise<StoredConversation[]> {
    let buf: string;
    try {
      buf = await fs.promises.readFile(this.storePath, 'utf-8');
    } catch (e: any) {
      // 仅「文件尚不存在」视为空列表；其它 IO 错误若当成 []，会在 normalize / upsert 时覆盖写盘，造成历史被清空。
      if (e && (e as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw e;
    }
    let raw: unknown;
    try {
      raw = JSON.parse(buf);
    } catch (e: any) {
      throw new Error(
        `[SessionStore] conversations JSON 损坏，已中止读写以免覆盖数据: ${this.storePath} (${e?.message ?? e})`
      );
    }
    const arr: unknown =
      Array.isArray(raw) ? raw : raw && typeof raw === 'object' && Array.isArray((raw as StorePayload).conversations)
        ? (raw as StorePayload).conversations
        : undefined;
    if (!Array.isArray(arr)) {
      throw new Error(`[SessionStore] conversations 文件结构无效（应为数组或 { conversations: [] }）: ${this.storePath}`);
    }
    return (arr as StoredConversation[]).filter((c) => c && typeof c.id === 'string');
  }

  /**
   * 每个工作区仅保留一条会话：0 条则创建；多条则按创建时间保留首条 id，合并全部消息后写回。
   */
  async normalizeToSingletonIfNeeded(): Promise<StoredConversation[]> {
    const all = await this.readAll();
    if (all.length === 0) {
      const now = Date.now();
      const c: StoredConversation = {
        id: randomUUID(),
        title: '对话',
        messages: [],
        createdAt: now,
        updatedAt: now,
      };
      await this.writeAll([c]);
      return [c];
    }
    if (all.length === 1) return all;

    const byCreated = [...all].sort((a, b) => a.createdAt - b.createdAt);
    const keeper = byCreated[0];
    const msgMap = new Map<string, StoredMessage>();
    for (const conv of byCreated) {
      for (const m of conv.messages ?? []) {
        if (m && typeof m.id === 'string' && !msgMap.has(m.id)) msgMap.set(m.id, m);
      }
    }
    const mergedMessages = dedupeStoredToolMessages(
      Array.from(msgMap.values()).sort((a, b) => a.timestamp - b.timestamp)
    );
    const next: StoredConversation = {
      ...keeper,
      messages: mergedMessages,
      updatedAt: Date.now(),
      title: keeper.title?.trim() ? keeper.title : '对话',
    };
    await this.writeAll([next]);
    return [next];
  }

  async writeAll(conversations: StoredConversation[]): Promise<void> {
    const payload: StorePayload = { conversations };
    const data = JSON.stringify(payload, null, 2);
    const target = this.storePath;
    await enqueueSerializedWrite(target, () => atomicWriteUtf8File(target, data));
  }

  async upsertConversation(conversation: StoredConversation): Promise<void> {
    const list = await this.readAll();
    const next = list.some((c) => c.id === conversation.id)
      ? list.map((c) => (c.id === conversation.id ? conversation : c))
      : [...list, conversation];
    await this.writeAll(next);
  }

  async deleteConversation(conversationId: string): Promise<void> {
    const list = await this.readAll();
    const next = list.filter((c) => c.id !== conversationId);
    await this.writeAll(next);
  }
}

