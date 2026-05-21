/**
 * 解析飞书 IM 入站事件（HTTP 2.0 信封、SDK 扁平结构、lark-cli event NDJSON）。
 */

import type { FeishuReceiveIdType } from '../main/prefs/messaging-prefs';

export type FeishuInboundExtract = {
  text: string;
  messageId: string;
  replyReceiveId: string;
  replyReceiveIdType: FeishuReceiveIdType;
  skipReason?: string;
};

export function normalizeSdkImPayloadToHttpEnvelope(data: unknown): Record<string, unknown> | null {
  if (!data || typeof data !== 'object') return null;
  const root = data as Record<string, unknown>;

  if (root.type === 'url_verification') return root;

  const ev = root.event && typeof root.event === 'object' ? (root.event as Record<string, unknown>) : null;
  if (ev) {
    const header =
      root.header && typeof root.header === 'object' ? (root.header as Record<string, unknown>) : null;
    const eventType = String(header?.event_type ?? '').trim() || String(ev.type ?? '').trim();
    if (!header || !String(header.event_type ?? '').trim()) {
      return {
        schema: String(root.schema ?? '2.0'),
        header: { ...(header ?? {}), event_type: eventType || 'im.message.receive_v1' },
        event: ev,
      };
    }
    return root;
  }

  if (root.message && typeof root.message === 'object') {
    return {
      schema: '2.0',
      header: { event_type: 'im.message.receive_v1' },
      event: root,
    };
  }

  const inner = root.data && typeof root.data === 'object' ? (root.data as Record<string, unknown>) : null;
  if (inner) {
    return normalizeSdkImPayloadToHttpEnvelope(inner);
  }

  return null;
}

function pickSenderReceiveTarget(sender: Record<string, unknown> | null): { id: string; type: FeishuReceiveIdType } | null {
  if (!sender) return null;
  const sid =
    sender.sender_id && typeof sender.sender_id === 'object' ? (sender.sender_id as Record<string, unknown>) : null;
  if (!sid) return null;
  const openId = String(sid.open_id ?? '').trim();
  if (openId) return { id: openId, type: 'open_id' };
  const unionId = String(sid.union_id ?? '').trim();
  if (unionId) return { id: unionId, type: 'union_id' };
  const userId = String(sid.user_id ?? '').trim();
  if (userId) return { id: userId, type: 'user_id' };
  return null;
}

function resolveImReceiveEventType(root: Record<string, unknown>): string {
  const header = root.header && typeof root.header === 'object' ? (root.header as Record<string, unknown>) : null;
  const fromHeader = String(header?.event_type ?? '').trim();
  if (fromHeader) return fromHeader;
  const ev = root.event && typeof root.event === 'object' ? (root.event as Record<string, unknown>) : null;
  if (root.type === 'event_callback' && ev) {
    return String(ev.type ?? '').trim();
  }
  if (ev && !header) {
    return String(ev.type ?? '').trim();
  }
  return '';
}

/** lark-cli event consume NDJSON 行（可能已 flatten） */
export function extractInboundFromEventConsumeLine(line: string): FeishuInboundExtract | null {
  const trimmed = String(line ?? '').trim();
  if (!trimmed) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed) as unknown;
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const root = parsed as Record<string, unknown>;

  // envelope from consume may put fields at top level
  if (root.event && typeof root.event === 'object') {
    return extractInboundText({ schema: '2.0', header: { event_type: 'im.message.receive_v1' }, event: root.event });
  }

  const text = String(root.text ?? root.content ?? '').trim();
  const messageId = String(root.message_id ?? root.messageId ?? '').trim();
  const chatId = String(root.chat_id ?? root.chatId ?? '').trim();
  const senderType = String(root.sender_type ?? root.senderType ?? '').toLowerCase();
  if (senderType === 'bot' || senderType === 'app') {
    return { text: '', messageId: '', replyReceiveId: '', replyReceiveIdType: 'chat_id', skipReason: 'sender_is_bot_or_app' };
  }
  if (text && (chatId || root.open_id)) {
    const openId = String(root.open_id ?? root.sender_id ?? '').trim();
    if (chatId) {
      return { text, messageId, replyReceiveId: chatId, replyReceiveIdType: 'chat_id' };
    }
    if (openId) {
      return { text, messageId, replyReceiveId: openId, replyReceiveIdType: 'open_id' };
    }
  }

  return extractInboundText(normalizeSdkImPayloadToHttpEnvelope(parsed));
}

export function extractInboundText(payload: unknown): FeishuInboundExtract | null {
  if (!payload || typeof payload !== 'object') return null;
  const root = payload as Record<string, unknown>;
  if (root.type === 'url_verification') return null;

  const eventType = resolveImReceiveEventType(root);
  if (eventType !== 'im.message.receive_v1') return null;

  const event = root.event && typeof root.event === 'object' ? (root.event as Record<string, unknown>) : null;
  if (!event) return null;

  const sender = event.sender && typeof event.sender === 'object' ? (event.sender as Record<string, unknown>) : null;
  const senderType = String(sender?.sender_type ?? '').toLowerCase();
  if (senderType === 'bot' || senderType === 'app') {
    return { text: '', messageId: '', replyReceiveId: '', replyReceiveIdType: 'chat_id', skipReason: 'sender_is_bot_or_app' };
  }

  const message = event.message && typeof event.message === 'object' ? (event.message as Record<string, unknown>) : null;
  if (!message) return null;
  const messageType = String(message.message_type ?? '').toLowerCase();
  const contentRaw = String(message.content ?? '');
  let text = '';
  if (messageType === 'text') {
    try {
      const cj = JSON.parse(contentRaw) as { text?: string };
      text = String(cj.text ?? '').trim();
    } catch {
      // lark-cli may already decode to plain text in content field
      text = contentRaw.trim();
      if (!text) return null;
    }
  } else if (messageType === 'post') {
    try {
      const cj = JSON.parse(contentRaw) as { title?: string };
      text = String(cj.title ?? '').trim();
      if (!text) text = '[post]';
    } catch {
      text = contentRaw.trim() || '[post]';
    }
  } else {
    return {
      text: '',
      messageId: '',
      replyReceiveId: '',
      replyReceiveIdType: 'chat_id',
      skipReason: `message_type:${messageType || '?'}`,
    };
  }
  const messageId = String(message.message_id ?? '').trim();
  const chatId = String(message.chat_id ?? '').trim();
  let replyReceiveId = chatId;
  let replyReceiveIdType: FeishuReceiveIdType = 'chat_id';
  if (!replyReceiveId) {
    const alt = pickSenderReceiveTarget(sender);
    if (alt) {
      replyReceiveId = alt.id;
      replyReceiveIdType = alt.type;
    }
  }
  if (!text || !replyReceiveId) return null;

  return { text, messageId, replyReceiveId, replyReceiveIdType };
}

export function extractFromSdkImReceive(data: unknown): FeishuInboundExtract | null {
  const envelope = normalizeSdkImPayloadToHttpEnvelope(data);
  if (!envelope) return null;
  return extractInboundText(envelope);
}
