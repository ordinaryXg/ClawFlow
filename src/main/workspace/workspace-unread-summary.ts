/**
 * 侧栏「工作区」行未读汇总：待办调度、子 Agent 需关注状态、飞书桥接会话中待回复等。
 */

import * as path from 'path';
import { SessionStore, type StoredConversation, type StoredMessage } from '../../engine/session-store';
import { countTodoTriggersForWorkspaceHub } from '../../shared/todo-triggers';
import type { SubAgentRunSnapshot, SubAgentSlot } from '../../shared/sub-agent-types';
import { readRunSnapshots } from '../sub-agent/sub-agent-run-snapshot';
import { readSubAgentSlots } from '../sub-agent/sub-agent-service';
import { readTodoTriggers } from '../todo/todo-triggers-service';

export type WorkspaceUnreadSummary = {
  workspaceRoot: string;
  todos: number;
  agent: number;
  messaging: number;
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

/** 主会话为主：仅根据「最近更新的」那条会话判断飞书桥接是否仍停在用户侧（避免历史/空会话误报）。 */
function pickLatestConversation(conversations: StoredConversation[]): StoredConversation | undefined {
  if (!Array.isArray(conversations) || conversations.length === 0) return undefined;
  return [...conversations].sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))[0];
}

/** 当前活跃会话中，最后一条非 tool 为飞书用户消息且尚无后续助手气泡时计 1。 */
export function countFeishuPendingRepliesInConversations(conversations: StoredConversation[]): number {
  const primary = pickLatestConversation(conversations);
  if (!primary) return 0;
  const last = lastNonToolMessage(primary.messages);
  if (last && last.role === 'user' && last.channel === 'user_feishu') return 1;
  return 0;
}

/**
 * 子 Agent「需处理」：槽位 error，或运行快照为 error。
 * 不包含 `interrupted`（多为异常退出/重启后的中间态，无法靠「读完主会话」消除，易误报未读）。
 */
export function countSubAgentAttention(slots: SubAgentSlot[], snaps: Record<string, SubAgentRunSnapshot>): number {
  const attention = new Set<string>();
  for (const s of slots) {
    if (s.status === 'error') attention.add(s.id);
    const snap = snaps[s.id];
    if (snap?.status === 'error') attention.add(s.id);
  }
  for (const [id, snap] of Object.entries(snaps)) {
    if (snap?.status === 'error') attention.add(id);
  }
  return attention.size;
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
  const triggers = await readTodoTriggers(root);
  const todos = countTodoTriggersForWorkspaceHub(triggers);
  const [slots, snaps, convs] = await Promise.all([
    readSubAgentSlots(root),
    readRunSnapshots(root),
    readConversationsSafe(root),
  ]);
  const agent = countSubAgentAttention(slots, snaps);
  const messaging = countFeishuPendingRepliesInConversations(convs);
  const total = todos + agent + messaging;
  return { workspaceRoot: root, todos, agent, messaging, total };
}

export async function summarizeWorkspacesUnread(paths: string[]): Promise<WorkspaceUnreadSummary[]> {
  const uniq = Array.from(new Set(paths.map((p) => path.resolve(String(p || '').trim())).filter(Boolean)));
  return Promise.all(uniq.map((r) => summarizeWorkspaceUnread(r)));
}
