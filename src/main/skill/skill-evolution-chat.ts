/**
 * 将进化管线输出写入主会话消息列表，供聊天窗口合并展示。
 */
import { randomUUID } from 'crypto';
import { SessionStore, type StoredMessage } from '../../engine/session/session-store';
import {
  broadcastChatConversationsDirty,
  broadcastChatEvolutionUpdate,
  type ChatEvolutionWireMessage,
} from '../../messaging/chat-broadcast';
import type { EvolutionAspectKey } from './skill-evolution-scheduler';

export const ASSISTANT_EVOLUTION_CHANNEL = 'assistant_evolution';

export type EvolutionChatSegment = 'dispatch' | EvolutionAspectKey | 'summary';

export type EvolutionChatMeta = {
  evolutionRunId: string;
  evolutionSegment: EvolutionChatSegment;
  evolutionStatus: 'running' | 'ok' | 'failed';
  manual?: boolean;
  diffCount?: number;
  failureReason?: string;
};

function toWire(m: StoredMessage): ChatEvolutionWireMessage {
  return {
    id: m.id,
    role: 'assistant',
    content: String(m.content ?? ''),
    timestamp: m.timestamp,
    channel: ASSISTANT_EVOLUTION_CHANNEL,
    ...(m.meta && typeof m.meta === 'object' ? { meta: m.meta as Record<string, unknown> } : {}),
  };
}

async function writeConversationMessages(
  workspaceRoot: string,
  conversationId: string,
  mutate: (messages: StoredMessage[]) => StoredMessage[]
): Promise<StoredMessage[] | null> {
  const root = String(workspaceRoot ?? '').trim();
  const convId = String(conversationId ?? '').trim();
  if (!root || !convId) return null;

  const store = new SessionStore(root);
  const convs = await store.readAll();
  const idx = convs.findIndex((c) => c.id === convId);
  if (idx < 0) return null;

  const c = convs[idx];
  const prev = (c.messages ?? []) as StoredMessage[];
  const nextMsgs = mutate(prev);
  const now = Date.now();
  convs[idx] = {
    ...c,
    messages: nextMsgs,
    updatedAt: now,
  };
  await store.writeAll(convs);
  return nextMsgs;
}

/** 追加一条进化消息；返回 messageId */
export async function appendEvolutionChatMessage(
  workspaceRoot: string,
  conversationId: string,
  part: { content: string; meta: EvolutionChatMeta }
): Promise<string | null> {
  const id = randomUUID();
  const ts = Date.now();
  const row: StoredMessage = {
    id,
    role: 'assistant',
    content: String(part.content ?? ''),
    timestamp: ts,
    channel: ASSISTANT_EVOLUTION_CHANNEL,
    meta: { ...part.meta },
  };

  const next = await writeConversationMessages(workspaceRoot, conversationId, (msgs) => [...msgs, row]);
  if (!next) return null;

  broadcastChatEvolutionUpdate({
    workspaceRoot,
    conversationId,
    kind: 'append',
    message: toWire(row),
  });
  broadcastChatConversationsDirty({ workspaceRoot });
  return id;
}

export async function patchEvolutionChatMessage(
  workspaceRoot: string,
  conversationId: string,
  messageId: string,
  patch: { content?: string; meta?: Partial<EvolutionChatMeta> }
): Promise<void> {
  const mid = String(messageId ?? '').trim();
  if (!mid) return;

  let updated: StoredMessage | null = null;
  await writeConversationMessages(workspaceRoot, conversationId, (msgs) =>
    msgs.map((m) => {
      if (m.id !== mid) return m;
      const meta = { ...(m.meta ?? {}), ...(patch.meta ?? {}) };
      const next: StoredMessage = {
        ...m,
        ...(patch.content !== undefined ? { content: patch.content } : {}),
        meta,
        timestamp: Date.now(),
      };
      updated = next;
      return next;
    })
  );

  if (!updated) return;
  broadcastChatEvolutionUpdate({
    workspaceRoot,
    conversationId,
    kind: 'patch',
    message: toWire(updated),
  });
}

export async function appendEvolutionChatMessages(
  workspaceRoot: string,
  conversationId: string,
  parts: Array<{ content: string; meta: EvolutionChatMeta }>
): Promise<void> {
  for (const p of parts) {
    await appendEvolutionChatMessage(workspaceRoot, conversationId, p);
  }
}

export const EVOLUTION_STREAM_DISPLAY_MAX = 24_000;

/**
 * 阶段结束时的展示正文：优先流式累积（与进行中 UI 一致）。
 * `sendMessage` 返回的 message 多为工具循环最后一轮短句（如 “Now update the Changelog.”），
 * 会覆盖用户已看到的流式内容。
 */
export function pickEvolutionPhaseDisplayText(streamAcc: string, finalMessage: string): string {
  const stream = streamAcc.trim();
  const final = finalMessage.trim();
  if (!stream) return final.slice(0, EVOLUTION_STREAM_DISPLAY_MAX);
  if (!final) {
    return stream.length > EVOLUTION_STREAM_DISPLAY_MAX
      ? stream.slice(-EVOLUTION_STREAM_DISPLAY_MAX)
      : stream;
  }
  if (stream.length >= final.length) {
    return stream.length > EVOLUTION_STREAM_DISPLAY_MAX
      ? stream.slice(-EVOLUTION_STREAM_DISPLAY_MAX)
      : stream;
  }
  return final.slice(0, EVOLUTION_STREAM_DISPLAY_MAX);
}

export type EvolutionChatBridge = {
  runId: string;
  manual: boolean;
  phaseMessageId: (aspect: EvolutionAspectKey) => string | undefined;
  dispatchStart: () => Promise<void>;
  phaseStart: (aspect: EvolutionAspectKey) => Promise<string | null>;
  phaseStream: (aspect: EvolutionAspectKey, content: string) => Promise<void>;
  phaseEnd: (aspect: EvolutionAspectKey, content: string, ok: boolean) => Promise<void>;
};

export function createEvolutionChatBridge(
  workspaceRoot: string,
  conversationId: string,
  runId: string,
  manual: boolean
): EvolutionChatBridge {
  const phaseIds = new Map<EvolutionAspectKey, string>();
  const streamBuf = new Map<EvolutionAspectKey, string>();
  const lastStreamPatchMs = new Map<EvolutionAspectKey, number>();
  const STREAM_PATCH_MIN_MS = 400;

  const baseMeta = (segment: EvolutionChatSegment, status: EvolutionChatMeta['evolutionStatus']): EvolutionChatMeta => ({
    evolutionRunId: runId,
    evolutionSegment: segment,
    evolutionStatus: status,
    manual,
  });

  return {
    runId,
    manual,
    phaseMessageId: (aspect) => phaseIds.get(aspect),
    dispatchStart: async () => {
      await appendEvolutionChatMessage(workspaceRoot, conversationId, {
        content: [
          '### 进化调度',
          '',
          '正在依次执行：**记忆整理** → **技能维护** → **角色同步**。',
          '',
          '下方将实时显示各阶段 Agent 输出。',
        ].join('\n'),
        meta: baseMeta('dispatch', 'running'),
      });
    },
    phaseStart: async (aspect) => {
      const title =
        aspect === 'memory' ? '记忆整理' : aspect === 'skills' ? '技能维护' : '角色同步';
      const id = await appendEvolutionChatMessage(workspaceRoot, conversationId, {
        content: `### ${title}\n\n_进行中…_`,
        meta: baseMeta(aspect, 'running'),
      });
      if (id) {
        phaseIds.set(aspect, id);
        streamBuf.set(aspect, '');
      }
      return id;
    },
    phaseStream: async (aspect, content) => {
      const id = phaseIds.get(aspect);
      if (!id) return;
      streamBuf.set(aspect, content);
      const now = Date.now();
      const last = lastStreamPatchMs.get(aspect) ?? 0;
      if (now - last < STREAM_PATCH_MIN_MS) return;
      lastStreamPatchMs.set(aspect, now);
      const title =
        aspect === 'memory' ? '记忆整理' : aspect === 'skills' ? '技能维护' : '角色同步';
      await patchEvolutionChatMessage(workspaceRoot, conversationId, id, {
        content: `### ${title}\n\n${content}`,
        meta: baseMeta(aspect, 'running'),
      });
    },
    phaseEnd: async (aspect, content, ok) => {
      const id = phaseIds.get(aspect);
      const title =
        aspect === 'memory' ? '记忆整理' : aspect === 'skills' ? '技能维护' : '角色同步';
      const buf = streamBuf.get(aspect) ?? '';
      const picked = pickEvolutionPhaseDisplayText(buf, String(content ?? ''));
      const body = picked.trim() || (ok ? '（本阶段无文字输出）' : '（本阶段失败）');
      if (id) {
        await patchEvolutionChatMessage(workspaceRoot, conversationId, id, {
          content: `### ${title}\n\n${body}`,
          meta: baseMeta(aspect, ok ? 'ok' : 'failed'),
        });
      } else if (body) {
        await appendEvolutionChatMessage(workspaceRoot, conversationId, {
          content: `### ${title}\n\n${body}`,
          meta: baseMeta(aspect, ok ? 'ok' : 'failed'),
        });
      }
      streamBuf.delete(aspect);
      lastStreamPatchMs.delete(aspect);
    },
  };
}
