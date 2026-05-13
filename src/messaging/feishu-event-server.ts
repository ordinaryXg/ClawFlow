/**
 * 飞书「长连接」接收 im.message.receive_v1（@larksuiteoapi/node-sdk WSClient）。
 * 收到消息后写入绑定工作区会话并触发模型，仅将最终正文经 HTTP API 回发飞书。
 * 需在开放平台将订阅方式设为「使用长连接接收事件」。
 */

import * as path from 'path';
import * as Lark from '@larksuiteoapi/node-sdk';
import { readMessagingPrefsFile } from '../messaging-prefs';
import type { FeishuReceiveIdType } from '../messaging-prefs';
import * as workspaceService from '../workspace-service';
import { getGlobalClawFlowEngine } from '../engine/clawflow-engine';
import { SessionStore } from '../engine/session-store';
import { feishuGetTenantAccessToken, feishuSendTextMessage, resolveFeishuAppCredentials } from './feishu-api';
import { formatAssistantReplyForFeishu } from './feishu-outbound-text';
import { broadcastChatConversationsDirty } from './chat-broadcast';

let wsClient: Lark.WSClient | null = null;

const recentMessageIds = new Set<string>();
const RECENT_CAP = 800;

function rememberMessageId(id: string): boolean {
  if (!id) return false;
  if (recentMessageIds.has(id)) return true;
  recentMessageIds.add(id);
  if (recentMessageIds.size > RECENT_CAP) {
    const it = recentMessageIds.values().next();
    if (!it.done) recentMessageIds.delete(it.value as string);
  }
  return false;
}

/** SDK 回调的 data 与 HTTP v2 的 event 结构一致，包一层再走原解析逻辑 */
function extractFromSdkImReceive(data: unknown): {
  text: string;
  messageId: string;
  replyReceiveId: string;
  replyReceiveIdType: FeishuReceiveIdType;
  skipReason?: string;
} | null {
  if (!data || typeof data !== 'object') return null;
  return extractInboundText({
    schema: '2.0',
    header: { event_type: 'im.message.receive_v1' },
    event: data as Record<string, unknown>,
  });
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

function extractInboundText(payload: unknown): {
  text: string;
  messageId: string;
  replyReceiveId: string;
  replyReceiveIdType: FeishuReceiveIdType;
  skipReason?: string;
} | null {
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
      return null;
    }
  } else if (messageType === 'post') {
    try {
      const cj = JSON.parse(contentRaw) as { title?: string };
      text = String(cj.title ?? '').trim();
      if (!text) text = '[post]';
    } catch {
      return null;
    }
  } else {
    return { text: '', messageId: '', replyReceiveId: '', replyReceiveIdType: 'chat_id', skipReason: `message_type:${messageType || '?'}` };
  }
  const messageId = String(message.message_id ?? '').trim();
  const chatId = String(message.chat_id ?? '').trim();
  if (!text || !chatId) return null;

  return {
    text,
    messageId,
    replyReceiveId: chatId,
    replyReceiveIdType: 'chat_id',
  };
}

async function resolveBridgeWorkspacePath(prefs: ReturnType<typeof readMessagingPrefsFile>): Promise<string> {
  const raw = String(prefs?.feishu?.bridgeWorkspacePath ?? '').trim();
  if (raw) return path.resolve(raw);
  const reg = workspaceService.loadRegistry();
  const active = reg.activeWorkspacePath?.trim();
  if (active) return path.resolve(active);
  return path.resolve(workspaceService.getDefaultWorkspacePath());
}

async function resolveConversationId(store: SessionStore, preferred: string | undefined): Promise<string | null> {
  const convs = await store.normalizeToSingletonIfNeeded();
  const pid = String(preferred ?? '').trim();
  if (pid) {
    const hit = convs.find((c) => c.id === pid);
    if (hit) return hit.id;
  }
  return convs[0]?.id ?? null;
}

let processChain: Promise<void> = Promise.resolve();

function enqueueFeishuInbound(job: () => Promise<void>): void {
  processChain = processChain.then(() => job()).catch((e) => {
    console.error('[feishu-ws] inbound job failed:', e instanceof Error ? e.message : e);
  });
}

async function handleImText(params: {
  text: string;
  messageId: string;
  replyReceiveId: string;
  replyReceiveIdType: FeishuReceiveIdType;
}): Promise<void> {
  const prefs = readMessagingPrefsFile();
  if (!prefs?.feishu?.bridgeEnabled) return;

  const wsRoot = await resolveBridgeWorkspacePath(prefs);
  const engine = getGlobalClawFlowEngine();
  const store = new SessionStore(wsRoot);
  const conversationId = await resolveConversationId(store, prefs.feishu?.bridgeConversationId);
  if (!conversationId) {
    console.warn('[feishu-ws] no conversation id');
    return;
  }

  if (params.messageId && rememberMessageId(params.messageId)) {
    return;
  }

  const senderLabel = String(prefs.feishu?.bridgeSenderLabel ?? 'Feishu').trim() || 'Feishu';

  await engine.appendPersistedUserMessage({
    workspaceRoot: wsRoot,
    conversationId,
    content: params.text,
    channel: 'user_feishu',
    meta: { source: 'feishu', senderLabel },
  });
  console.log(
    `[feishu-ws] persisted inbound user_feishu workspace=${wsRoot} conversation=${conversationId} preview=${params.text.slice(0, 80)}`,
  );
  broadcastChatConversationsDirty({ workspaceRoot: wsRoot });

  const { appId, appSecret } = resolveFeishuAppCredentials();
  if (!appId || !appSecret) {
    console.warn('[feishu-ws] missing app credentials, skip AI + reply');
    return;
  }

  let replyText = '';
  try {
    const res = await engine.sendMessage({
      conversationId,
      userText: params.text,
      mode: 'multitask',
      workspaceRoot: wsRoot,
      assistantMessageMeta: { source: 'feishu_bridge' },
    });
    replyText = formatAssistantReplyForFeishu(res.message ?? '');
  } catch (e: unknown) {
    console.error('[feishu-ws] sendMessage failed:', e instanceof Error ? e.message : e);
    replyText = `【ClawFlow】处理失败：${e instanceof Error ? e.message : String(e)}`;
  }

  if (!replyText.trim()) return;

  try {
    const { token } = await feishuGetTenantAccessToken(appId, appSecret);
    await feishuSendTextMessage({
      token,
      receiveIdType: params.replyReceiveIdType,
      receiveId: params.replyReceiveId,
      text: replyText,
    });
  } catch (e: unknown) {
    console.error('[feishu-ws] reply to Feishu failed:', e instanceof Error ? e.message : e);
  }

  broadcastChatConversationsDirty({ workspaceRoot: wsRoot });
}

function onSdkImMessageReceive(data: unknown): void {
  try {
    const extracted = extractFromSdkImReceive(data);
    if (!extracted) {
      console.warn('[feishu-ws] im.message.receive_v1: could not parse payload (check IM scopes / message shape)');
      return;
    }
    if (extracted.skipReason) {
      console.log(`[feishu-ws] skipped: ${extracted.skipReason}`);
      return;
    }
    console.log(`[feishu-ws] enqueue inbound message_id=${extracted.messageId} len=${extracted.text.length}`);
    enqueueFeishuInbound(() =>
      handleImText({
        text: extracted.text,
        messageId: extracted.messageId,
        replyReceiveId: extracted.replyReceiveId,
        replyReceiveIdType: extracted.replyReceiveIdType,
      }),
    );
  } catch (e: unknown) {
    console.error('[feishu-ws] handler error:', e instanceof Error ? e.message : e);
  }
}

export function stopFeishuEventServer(): void {
  if (!wsClient) return;
  try {
    wsClient.close({ force: true });
  } catch {
    /* ignore */
  }
  wsClient = null;
}

export function restartFeishuEventServerFromPrefs(): void {
  stopFeishuEventServer();
  const prefs = readMessagingPrefsFile();
  const fe = prefs?.feishu;
  if (!fe?.bridgeEnabled) {
    console.log('[feishu-ws] long connection not started: bridge disabled (Settings → Feishu → 消息桥接).');
    return;
  }

  const { appId, appSecret } = resolveFeishuAppCredentials();
  if (!appId || !appSecret) {
    console.warn('[feishu-ws] long connection not started: missing App ID / App Secret (or env FEISHU_*).');
    return;
  }

  const client = new Lark.WSClient({
    appId,
    appSecret,
    domain: Lark.Domain.Feishu,
    loggerLevel: Lark.LoggerLevel.info,
    onError: (e: unknown) => {
      console.error('[feishu-ws] client onError:', e instanceof Error ? e.message : e);
    },
  });

  const dispatcher = new Lark.EventDispatcher({}).register({
    'im.message.receive_v1': async (data: unknown) => {
      onSdkImMessageReceive(data);
    },
  });

  wsClient = client;
  void (async () => {
    try {
      await client.start({ eventDispatcher: dispatcher });
      console.log(
        '[feishu-ws] WSClient started. Ensure Feishu app → 事件与回调 → 订阅方式 is「使用长连接接收事件」；日志见本终端。',
      );
    } catch (e: unknown) {
      console.error('[feishu-ws] WSClient.start failed:', e instanceof Error ? e.message : e);
      wsClient = null;
    }
  })();
}
