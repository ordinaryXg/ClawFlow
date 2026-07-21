import { v4 as uuidv4 } from 'uuid';
import { mergeCompletionReasoning } from '../../../utils/split-reasoning-from-content';
import { dedupeUiToolMessages } from '../../../engine/tool-runtime/dedupe-tool-messages';
import type { Conversation, Message } from './chat-store-types';
import { coerceMessageChannel } from './chat-store-types';

export function normalizeConversation(raw: unknown): Conversation | null {
  if (!raw || typeof raw !== 'object') return null;
  const c = raw as Record<string, unknown>;
  if (typeof c.id !== 'string') return null;
  const msgs = Array.isArray(c.messages) ? c.messages : [];
  const messages: Message[] = msgs
    .filter((m) => {
      const r = m as Record<string, unknown>;
      return r?.role === 'user' || r?.role === 'assistant' || r?.role === 'tool';
    })
    .map((m: any) => {
      const id = typeof m?.id === 'string' ? m.id : uuidv4();
      const ts = typeof m?.timestamp === 'number' ? m.timestamp : Date.now();
      if (m?.role === 'user') {
        const ch = coerceMessageChannel('user', (m as Record<string, unknown>).channel);
        return {
          id,
          role: 'user' as const,
          content: String(m?.content ?? ''),
          timestamp: ts,
          ...(ch ? { channel: ch } : {}),
        };
      }
      if (m?.role === 'tool') {
        const toolCallId = typeof m?.tool_call_id === 'string' ? m.tool_call_id : '';
        const meta = m?.meta && typeof m.meta === 'object' ? (m.meta as Record<string, unknown>) : undefined;
        // tool 消息默认不展示渠道 strip（channel 缺省），通过 ToolMessageItem 自己做样式
        return {
          id,
          role: 'tool' as const,
          content: String(m?.content ?? ''),
          timestamp: ts,
          ...(toolCallId ? { toolCallId } : {}),
          ...(meta ? { meta } : {}),
        };
      }
      const merged = mergeCompletionReasoning(m?.content, m?.reasoning_content);
      const rc = merged.reasoningCombined.trim() || undefined;
      const ach = coerceMessageChannel('assistant', (m as Record<string, unknown>).channel);
      const meta = m?.meta && typeof m.meta === 'object' ? (m.meta as Record<string, unknown>) : undefined;
      return {
        id,
        role: 'assistant' as const,
        content: merged.displayContent,
        timestamp: ts,
        ...(rc ? { reasoningContent: rc } : {}),
        ...(ach ? { channel: ach } : {}),
        ...(meta ? { meta } : {}),
      };
    });
  const now = Date.now();
  return {
    id: c.id,
    title: typeof c.title === 'string' ? c.title : '主会话',
    messages: dedupeUiToolMessages(messages),
    createdAt: typeof c.createdAt === 'number' ? c.createdAt : now,
    updatedAt: typeof c.updatedAt === 'number' ? c.updatedAt : now,
  };
}

/** 尚未被 engine 列表确认的本地新建会话 id → 规范化工作区路径，避免 fetch 竞态覆盖，且避免跨工作区串会话 */
export const optimisticConversationWorkspace = new Map<string, string>();

export function conversationForEngineUpsert(conv: Conversation) {
  return {
    ...conv,
    messages: conv.messages.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      timestamp: m.timestamp,
      ...(m.channel ? { channel: m.channel } : {}),
      ...(m.role === 'assistant' && m.reasoningContent?.trim()
        ? { reasoning_content: m.reasoningContent.trim() }
        : {}),
      ...(m.role === 'tool' && m.toolCallId ? { tool_call_id: m.toolCallId } : {}),
      ...(m.meta && Object.keys(m.meta).length ? { meta: m.meta } : {}),
    })),
  };
}

/** fetch 后合并：保留本地 meta/channel 等，避免 upsert 未带 meta 时进化卡片被「打散」或丢失 */
export function mergeServerMessagesWithLocal(prev: Message[], fromServer: Message[]): Message[] {
  if (!fromServer.length) return fromServer;
  if (!prev.length) return fromServer;
  const prevById = new Map(prev.map((m) => [m.id, m]));
  const merged = fromServer.map((m) => {
    const local = prevById.get(m.id);
    if (!local) return m;
    const meta =
      local.meta || m.meta
        ? { ...(local.meta ?? {}), ...(m.meta ?? {}) }
        : undefined;
    return {
      ...m,
      channel: m.channel ?? local.channel,
      ...(meta && Object.keys(meta).length ? { meta } : {}),
      ...(m.toolCallId ?? local.toolCallId ? { toolCallId: m.toolCallId ?? local.toolCallId } : {}),
      ...(m.reasoningContent ?? local.reasoningContent
        ? { reasoningContent: m.reasoningContent ?? local.reasoningContent }
        : {}),
    };
  });
  const serverIds = new Set(fromServer.map((m) => m.id));
  for (const m of prev) {
    if (!serverIds.has(m.id)) merged.push(m);
  }
  return merged.sort((a, b) => a.timestamp - b.timestamp);
}
