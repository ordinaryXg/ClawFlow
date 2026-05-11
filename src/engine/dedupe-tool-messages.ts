import type { StoredMessage } from './session-store';

/** 用于在多条 tool 记录中选出应保留的一条（数值越大越优先）。 */
function toolMessageRank(content: string, meta?: Record<string, unknown>): number {
  const c = String(content ?? '').trim();
  if (c.startsWith('[start]') || c.startsWith('[tool:start]')) return 0;
  const status = typeof meta?.status === 'string' ? meta.status : '';
  const uiStatus = typeof meta?.uiStatus === 'string' ? meta.uiStatus : '';
  if (status === 'result' || status === 'error') return 5;
  if (uiStatus === 'error') return 5;
  if (uiStatus === 'running') return 1;
  if (uiStatus === 'success' || status === 'success') return 3;
  const looksStructured = c.startsWith('{') && (c.includes('"ok"') || c.includes('"error"'));
  if (looksStructured || (c.startsWith('[') && c.includes('{'))) return 4;
  if (!status && !uiStatus && c.length > 20) return 4;
  return 2;
}

function isBetterStoredTool(a: StoredMessage, b: StoredMessage): boolean {
  const ra = toolMessageRank(a.content, a.meta);
  const rb = toolMessageRank(b.content, b.meta);
  if (ra > rb) return true;
  if (ra < rb) return false;
  return (a.timestamp ?? 0) >= (b.timestamp ?? 0);
}

/**
 * 会话中 role=tool 且 tool_call_id 相同的多条记录只保留一条（优先最终结果、结构化输出；淘汰遗留的 [start]/running）。
 * 顺序：保留「胜出」项在原数组中的位置，其余同 id 条目删除。
 */
export function dedupeStoredToolMessages(messages: StoredMessage[]): StoredMessage[] {
  type Entry = { msg: StoredMessage; idx: number };
  const groups = new Map<string, Entry[]>();
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i]!;
    if (m.role !== 'tool') continue;
    const tid = String(m.tool_call_id ?? '').trim();
    if (!tid) continue;
    const arr = groups.get(tid) ?? [];
    arr.push({ msg: m, idx: i });
    groups.set(tid, arr);
  }
  const skip = new Set<number>();
  for (const entries of groups.values()) {
    if (entries.length <= 1) continue;
    let best = entries[0]!;
    for (const e of entries.slice(1)) {
      if (isBetterStoredTool(e.msg, best.msg)) best = e;
    }
    for (const e of entries) {
      if (e.idx !== best.idx) skip.add(e.idx);
    }
  }
  return messages.filter((_, i) => !skip.has(i));
}

export type UiToolLikeMessage = {
  role: string;
  content: string;
  timestamp: number;
  toolCallId?: string;
  meta?: Record<string, unknown>;
};

function isBetterUiTool(a: UiToolLikeMessage, b: UiToolLikeMessage): boolean {
  const ra = toolMessageRank(a.content, a.meta);
  const rb = toolMessageRank(b.content, b.meta);
  if (ra > rb) return true;
  if (ra < rb) return false;
  return (a.timestamp ?? 0) >= (b.timestamp ?? 0);
}

/** 前端 Message 列表：按 toolCallId 合并重复工具卡片（与持久化 dedupe 规则一致）。 */
export function dedupeUiToolMessages<T extends UiToolLikeMessage>(messages: T[]): T[] {
  type Entry = { msg: T; idx: number };
  const groups = new Map<string, Entry[]>();
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i]!;
    if (m.role !== 'tool') continue;
    const tid = String(m.toolCallId ?? '').trim();
    if (!tid) continue;
    const arr = groups.get(tid) ?? [];
    arr.push({ msg: m, idx: i });
    groups.set(tid, arr);
  }
  const skip = new Set<number>();
  for (const entries of groups.values()) {
    if (entries.length <= 1) continue;
    let best = entries[0]!;
    for (const e of entries.slice(1)) {
      if (isBetterUiTool(e.msg, best.msg)) best = e;
    }
    for (const e of entries) {
      if (e.idx !== best.idx) skip.add(e.idx);
    }
  }
  return messages.filter((_, i) => !skip.has(i));
}
