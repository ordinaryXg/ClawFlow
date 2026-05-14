/**
 * 侧栏「工作区」行未读汇总：飞书桥接主会话待回复。
 */

import * as path from 'path';
import { SessionStore, type StoredConversation, type StoredMessage } from '../../engine/session-store';

export type WorkspaceUnreadSummary = {
  workspaceRoot: string;
  total: number;
};

function lastNonToolMessage(messages: StoredMessage[] | undefined): StoredMessage | undefined {
  if (!Array.isArray(messages)) return undefined;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m && m.role !== 'tool') return m;
  }
  return undefined;
}

/**
 * 主会话为主：与 SessionStore.normalizeToSingletonIfNeeded 一致，按创建时间取首条会话，
 * 避免「最近被元数据 touch 的副会话」抢走未读判断（切换工作区后仍误显示飞书未读）。
 */
function pickPrimaryConversation(conversations: StoredConversation[]): StoredConversation | undefined {
  if (!Array.isArray(conversations) || conversations.length === 0) return undefined;
  if (conversations.length === 1) return conversations[0];
  return [...conversations].sort((a, b) => a.createdAt - b.createdAt)[0];
}

/** 主会话中，最后一条非 tool 为飞书用户消息且尚无后续助手气泡时计 1。 */
export function countFeishuPendingRepliesInConversations(conversations: StoredConversation[]): number {
  const primary = pickPrimaryConversation(conversations);
  if (!primary) return 0;
  const last = lastNonToolMessage(primary.messages);
  if (last && last.role === 'user' && last.channel === 'user_feishu') return 1;
  return 0;
}

async function readConversationsSafe(workspaceRoot: string): Promise<StoredConversation[]> {
  try {
    const store = new SessionStore(path.resolve(workspaceRoot));
    return await store.readAll();
  } catch {
    return [];
  }
}

export async function summarizeWorkspaceUnread(workspaceRoot: string): Promise<WorkspaceUnreadSummary> {
  const root = path.resolve(String(workspaceRoot || '').trim());
  const convs = await readConversationsSafe(root);
  const total = countFeishuPendingRepliesInConversations(convs);
  return { workspaceRoot: root, total };
}

export async function summarizeWorkspacesUnread(paths: string[]): Promise<WorkspaceUnreadSummary[]> {
  const uniq = Array.from(new Set(paths.map((p) => path.resolve(String(p || '').trim())).filter(Boolean)));
  return Promise.all(uniq.map((r) => summarizeWorkspaceUnread(r)));
}
