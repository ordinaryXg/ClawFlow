import * as path from 'path';
import { broadcastChatConversationsDirty } from '../messaging/chat-broadcast';
import { refreshHermesMemoryIndex } from './hermes-memory-service';

/** UI 侧栏/会话列表刷新：合并短时间内的多次落盘通知 */
const BROADCAST_DEBOUNCE_MS = 400;
/** Hermes FTS 增量同步：工具循环内会频繁落盘，须合并避免 CPU 飙升 */
const HERMES_DEBOUNCE_MS = 2000;

type PendingTimers = {
  broadcastTimer: ReturnType<typeof setTimeout> | null;
  hermesTimer: ReturnType<typeof setTimeout> | null;
};

const pendingByRoot = new Map<string, PendingTimers>();

function resolveRootKey(workspaceRoot: string): string {
  return path.resolve(String(workspaceRoot ?? '').trim() || process.cwd());
}

function getPending(rootKey: string): PendingTimers {
  let p = pendingByRoot.get(rootKey);
  if (!p) {
    p = { broadcastTimer: null, hermesTimer: null };
    pendingByRoot.set(rootKey, p);
  }
  return p;
}

function runBroadcast(workspaceRoot: string): void {
  try {
    broadcastChatConversationsDirty({ workspaceRoot });
  } catch {
    /* ignore */
  }
}

function runHermesRefresh(workspaceRoot: string): void {
  try {
    refreshHermesMemoryIndex(workspaceRoot);
  } catch {
    /* ignore */
  }
}

function scheduleHermesTimer(rootKey: string, p: PendingTimers): void {
  if (p.hermesTimer) clearTimeout(p.hermesTimer);
  p.hermesTimer = setTimeout(() => {
    p.hermesTimer = null;
    runHermesRefresh(rootKey);
  }, HERMES_DEBOUNCE_MS);
}

/** 合并 Hermes FTS 增量同步（工具写盘、memory upsert 等高频路径共用）。 */
export function scheduleHermesMemoryIndexRefresh(workspaceRoot: string): void {
  const rootKey = resolveRootKey(workspaceRoot);
  const p = getPending(rootKey);
  scheduleHermesTimer(rootKey, p);
}

/** 立即执行待处理的 Hermes 同步。 */
export function flushHermesMemoryIndexRefresh(workspaceRoot: string): void {
  const rootKey = resolveRootKey(workspaceRoot);
  const p = pendingByRoot.get(rootKey);
  if (p?.hermesTimer) {
    clearTimeout(p.hermesTimer);
    p.hermesTimer = null;
  }
  runHermesRefresh(rootKey);
}

/** 合并会话落盘后的广播与 Hermes 索引同步（工具多步循环中会高频触发）。 */
export function scheduleConversationsPersistedSideEffects(workspaceRoot: string): void {
  const rootKey = resolveRootKey(workspaceRoot);
  const p = getPending(rootKey);

  if (p.broadcastTimer) clearTimeout(p.broadcastTimer);
  p.broadcastTimer = setTimeout(() => {
    p.broadcastTimer = null;
    runBroadcast(rootKey);
  }, BROADCAST_DEBOUNCE_MS);

  scheduleHermesTimer(rootKey, p);
}

/** 立即执行待处理的侧效应（一轮对话结束、用户显式保存等）。 */
export function flushConversationsPersistedSideEffects(workspaceRoot: string): void {
  const rootKey = resolveRootKey(workspaceRoot);
  const p = pendingByRoot.get(rootKey);
  if (p?.broadcastTimer) {
    clearTimeout(p.broadcastTimer);
    p.broadcastTimer = null;
  }
  if (p?.hermesTimer) {
    clearTimeout(p.hermesTimer);
    p.hermesTimer = null;
  }
  pendingByRoot.delete(rootKey);
  runBroadcast(rootKey);
  runHermesRefresh(rootKey);
}