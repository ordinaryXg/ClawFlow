import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import { conversationsStorePath } from '../../main/workspace/workspace-service';
import { getOrOpenHermesMemoryDb, getHermesMemoryDbPath } from '../hermes/hermes-memory-db';
import type { StoredConversation, StoredMessage } from '../session/session-store';

export type ConversationMessageBreakdown = {
  totalMessages: number;
  byRole: Record<string, number>;
  contentChars: number;
  reasoningChars: number;
  toolResultChars: number;
  largestMessages: Array<{ role: string; chars: number; preview: string }>;
};

export type MemoryDiagnosticsReport = {
  ts: number;
  process: {
    rssMb: number;
    heapUsedMb: number;
    heapTotalMb: number;
    externalMb: number;
    arrayBuffersMb: number;
  };
  workspaceRoot: string | null;
  conversationsFile: {
    path: string | null;
    bytes: number;
    conversationCount: number;
    breakdown: ConversationMessageBreakdown | null;
    /** 主进程 SessionStore 缓存命中时的估算（与磁盘 JSON 可能一致） */
    sessionCacheLoaded: boolean;
  };
  hermes: {
    dbPath: string | null;
    dbBytes: number;
    memoryDocsRows: number;
    ftsRows: number;
    memoryDocsBodyChars: number;
  } | null;
  electronUserData: {
    codeCacheMb: number;
    serviceWorkerMb: number;
    gpuCacheMb: number;
    totalMb: number;
  };
  factors: Array<{ id: string; severity: 'low' | 'medium' | 'high'; detail: string }>;
};

function dirSizeBytes(dir: string): number {
  let total = 0;
  try {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) total += dirSizeBytes(p);
      else if (ent.isFile()) {
        try {
          total += fs.statSync(p).size;
        } catch {
          /* ignore */
        }
      }
    }
  } catch {
    /* ignore */
  }
  return total;
}

function mb(n: number): number {
  return Math.round((n / (1024 * 1024)) * 100) / 100;
}

function messageChars(m: StoredMessage): { content: number; reasoning: number } {
  const content = String(m.content ?? '').length;
  const reasoning = String(m.reasoning_content ?? '').length;
  return { content, reasoning };
}

export function analyzeConversationMessages(messages: StoredMessage[]): ConversationMessageBreakdown {
  const byRole: Record<string, number> = {};
  let contentChars = 0;
  let reasoningChars = 0;
  let toolResultChars = 0;
  const sized: Array<{ role: string; chars: number; preview: string }> = [];

  for (const m of messages) {
    const role = String(m.role ?? 'unknown');
    byRole[role] = (byRole[role] ?? 0) + 1;
    const { content, reasoning } = messageChars(m);
    contentChars += content;
    reasoningChars += reasoning;
    if (role === 'tool') toolResultChars += content;
    sized.push({
      role,
      chars: content + reasoning,
      preview: String(m.content ?? '').replace(/\s+/g, ' ').slice(0, 80),
    });
  }

  sized.sort((a, b) => b.chars - a.chars);
  return {
    totalMessages: messages.length,
    byRole,
    contentChars,
    reasoningChars,
    toolResultChars,
    largestMessages: sized.slice(0, 8),
  };
}

function readConversationsFromFile(storePath: string): StoredConversation[] {
  const raw = JSON.parse(fs.readFileSync(storePath, 'utf-8')) as unknown;
  if (Array.isArray(raw)) return raw as StoredConversation[];
  if (raw && typeof raw === 'object' && Array.isArray((raw as { conversations?: unknown }).conversations)) {
    return (raw as { conversations: StoredConversation[] }).conversations;
  }
  return [];
}

function inferFactors(input: {
  convBytes: number;
  breakdown: ConversationMessageBreakdown | null;
  hermesBodyChars: number;
  electronCacheMb: number;
  heapUsedMb: number;
}): MemoryDiagnosticsReport['factors'] {
  const factors: MemoryDiagnosticsReport['factors'] = [];
  const b = input.breakdown;

  if (b && b.totalMessages > 80) {
    factors.push({
      id: 'conversation_message_count',
      severity: b.totalMessages > 200 ? 'high' : 'medium',
      detail: `会话消息 ${b.totalMessages} 条；Zustand 与 SessionStore 各持一份，fetch 时还会临时复制。`,
    });
  }

  if (b && b.toolResultChars > 500_000) {
    factors.push({
      id: 'tool_result_bulk',
      severity: b.toolResultChars > 2_000_000 ? 'high' : 'medium',
      detail: `tool 消息正文合计 ${Math.round(b.toolResultChars / 1024)} KB（单条上限 256 KB）。`,
    });
  }

  if (b && b.reasoningChars > 200_000) {
    factors.push({
      id: 'reasoning_content',
      severity: 'medium',
      detail: `reasoning_content 合计 ${Math.round(b.reasoningChars / 1024)} KB，会随历史发给模型并驻留内存。`,
    });
  }

  if (input.convBytes > 2 * 1024 * 1024) {
    factors.push({
      id: 'conversations_json_file',
      severity: input.convBytes > 10 * 1024 * 1024 ? 'high' : 'medium',
      detail: `conversations.json 磁盘 ${mb(input.convBytes)} MB；每次 append 整文件 JSON.parse/stringify。`,
    });
  }

  if (input.hermesBodyChars > 1_000_000) {
    factors.push({
      id: 'hermes_memory_docs',
      severity: 'medium',
      detail: `Hermes memory_docs.body 合计约 ${Math.round(input.hermesBodyChars / 1024)} KB（含技能/知识库/会话摘要）。`,
    });
  }

  if (input.electronCacheMb > 300) {
    factors.push({
      id: 'electron_chromium_cache',
      severity: input.electronCacheMb > 600 ? 'high' : 'medium',
      detail: `Electron 渲染缓存（Code Cache + Service Worker 等）约 ${input.electronCacheMb} MB，与对话轮次弱相关但会整体拖慢。`,
    });
  }

  if (input.heapUsedMb > 512) {
    factors.push({
      id: 'main_heap',
      severity: input.heapUsedMb > 1024 ? 'high' : 'medium',
      detail: `主进程 heapUsed ${input.heapUsedMb} MB。`,
    });
  }

  if (factors.length === 0) {
    factors.push({
      id: 'no_dominant_factor',
      severity: 'low',
      detail: '当前磁盘会话体量较小；若仍卡顿，请在复现后立刻采样（内存主要在运行时累积）。',
    });
  }

  return factors;
}

export function collectMemoryDiagnostics(opts?: {
  workspaceRoot?: string | null;
  sessionCacheLoaded?: boolean;
}): MemoryDiagnosticsReport {
  const mem = process.memoryUsage();
  const workspaceRoot = opts?.workspaceRoot?.trim() ? path.resolve(opts.workspaceRoot.trim()) : null;

  let convPath: string | null = null;
  let convBytes = 0;
  let conversationCount = 0;
  let breakdown: ConversationMessageBreakdown | null = null;

  if (workspaceRoot) {
    convPath = conversationsStorePath(workspaceRoot);
    try {
      convBytes = fs.statSync(convPath).size;
      const convs = readConversationsFromFile(convPath);
      conversationCount = convs.length;
      const allMsgs = convs.flatMap((c) => c.messages ?? []);
      breakdown = analyzeConversationMessages(allMsgs);
    } catch {
      convPath = convPath ?? null;
    }
  }

  let hermes: MemoryDiagnosticsReport['hermes'] = null;
  let hermesBodyChars = 0;
  if (workspaceRoot) {
    const dbPath = getHermesMemoryDbPath(workspaceRoot);
    let dbBytes = 0;
    try {
      dbBytes = fs.statSync(dbPath).size;
    } catch {
      dbBytes = 0;
    }
    const db = getOrOpenHermesMemoryDb(workspaceRoot);
    if (db) {
      try {
        const docRow = db.prepare(`SELECT COUNT(*) AS n, COALESCE(SUM(LENGTH(body)), 0) AS chars FROM memory_docs`).get() as {
          n: number;
          chars: number;
        };
        const ftsRow = db.prepare(`SELECT COUNT(*) AS n FROM memory_fts`).get() as { n: number };
        hermesBodyChars = Number(docRow?.chars ?? 0);
        hermes = {
          dbPath,
          dbBytes,
          memoryDocsRows: Number(docRow?.n ?? 0),
          ftsRows: Number(ftsRow?.n ?? 0),
          memoryDocsBodyChars: hermesBodyChars,
        };
      } catch {
        hermes = { dbPath, dbBytes, memoryDocsRows: 0, ftsRows: 0, memoryDocsBodyChars: 0 };
      }
    }
  }

  const userData = app.getPath('userData');
  const codeCacheMb = mb(dirSizeBytes(path.join(userData, 'Code Cache')));
  const serviceWorkerMb = mb(dirSizeBytes(path.join(userData, 'Service Worker')));
  const gpuCacheMb = mb(dirSizeBytes(path.join(userData, 'GPUCache')));
  const totalMb = mb(dirSizeBytes(userData));

  return {
    ts: Date.now(),
    process: {
      rssMb: mb(mem.rss),
      heapUsedMb: mb(mem.heapUsed),
      heapTotalMb: mb(mem.heapTotal),
      externalMb: mb(mem.external),
      arrayBuffersMb: mb(mem.arrayBuffers ?? 0),
    },
    workspaceRoot,
    conversationsFile: {
      path: convPath,
      bytes: convBytes,
      conversationCount,
      breakdown,
      sessionCacheLoaded: Boolean(opts?.sessionCacheLoaded),
    },
    hermes,
    electronUserData: {
      codeCacheMb,
      serviceWorkerMb,
      gpuCacheMb,
      totalMb,
    },
    factors: inferFactors({
      convBytes,
      breakdown,
      hermesBodyChars,
      electronCacheMb: codeCacheMb + serviceWorkerMb,
      heapUsedMb: mb(mem.heapUsed),
    }),
  };
}
