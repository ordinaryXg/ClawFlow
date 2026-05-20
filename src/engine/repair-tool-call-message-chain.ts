import type { ChatMessage, ToolCall } from './providers/types';

const PLACEHOLDER_TOOL_RESULT =
  '[ClawFlow] Tool result unavailable (prior turn incomplete, cancelled, or tool-loop step limit).';

function toolCallIdsFromAssistant(m: ChatMessage): string[] {
  const tcs = Array.isArray(m.tool_calls) ? (m.tool_calls as ToolCall[]) : [];
  return tcs.map((tc) => String(tc?.id ?? '').trim()).filter(Boolean);
}

/**
 * 修复 OpenAI/DeepSeek 工具轮次消息序：
 * - 丢弃前一条 assistant 无 tool_calls 的孤立 `tool` 消息
 * - 在 assistant(tool_calls) 未收齐 tool 回复前出现 user/assistant 时，补占位 tool 消息
 */
export function repairToolCallMessageChain(messages: readonly ChatMessage[]): ChatMessage[] {
  const out: ChatMessage[] = [];
  let pending = new Set<string>();

  const flushPendingPlaceholders = () => {
    if (pending.size === 0) return;
    for (const id of pending) {
      out.push({ role: 'tool', tool_call_id: id, content: PLACEHOLDER_TOOL_RESULT });
    }
    pending.clear();
  };

  for (const m of messages) {
    if (m.role === 'system') {
      flushPendingPlaceholders();
      out.push(m);
      continue;
    }

    if (m.role === 'tool') {
      const id = String(m.tool_call_id ?? '').trim();
      if (!id || pending.size === 0 || !pending.has(id)) {
        continue;
      }
      pending.delete(id);
      out.push(m);
      continue;
    }

    if (m.role === 'assistant') {
      if (pending.size > 0) flushPendingPlaceholders();
      out.push(m);
      const ids = toolCallIdsFromAssistant(m);
      pending = ids.length ? new Set(ids) : new Set();
      continue;
    }

    if (m.role === 'user') {
      if (pending.size > 0) flushPendingPlaceholders();
      out.push(m);
      continue;
    }

    flushPendingPlaceholders();
    out.push(m);
  }

  flushPendingPlaceholders();
  return out;
}
