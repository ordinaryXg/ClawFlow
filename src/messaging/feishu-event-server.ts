/**
 * 飞书「长连接」接收 im.message.receive_v1（@larksuiteoapi/node-sdk WSClient）。
 * 支持多自建应用：每个启用桥接的机器人独立 WSClient，事件与回执按 botId 隔离。
 */

import * as path from 'path';
import {
  readMessagingPrefsFile,
  getNormalizedFeishuBots,
  type FeishuBotConfig,
  type FeishuReceiveIdType,
} from '../main/prefs/messaging-prefs';
import * as workspaceService from '../main/workspace/workspace-service';
import { getGlobalClawFlowEngine } from '../engine/clawflow-engine';
import { SessionStore } from '../engine/session-store';
import { feishuGetTenantAccessToken, feishuSendTextMessage, resolveFeishuAppCredentials } from './feishu-api';
import { formatAssistantReplyForFeishu } from './feishu-outbound-text';
import { broadcastChatConversationsDirty } from './chat-broadcast';

/** 运行时加载（webpack external）；未安装时主进程仍可启动，仅飞书长连不可用 */
function loadLarkSdk(): any {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('@larksuiteoapi/node-sdk');
  } catch (e: unknown) {
    console.warn(
      '[feishu-ws] @larksuiteoapi/node-sdk 未安装或加载失败，飞书长连接已跳过。请在项目根执行: npm install @larksuiteoapi/node-sdk',
      e instanceof Error ? e.message : e,
    );
    return null;
  }
}

type FeishuWsClient = { close: (opts?: { force?: boolean }) => void; start: (opts: unknown) => Promise<void> };

const wsClients = new Map<string, FeishuWsClient>();

const recentDedupeKeys = new Set<string>();
const RECENT_CAP = 2000;

function rememberDedupeKey(botId: string, messageId: string): boolean {
  const key = `${botId}::${messageId}`;
  if (!messageId) return false;
  if (recentDedupeKeys.has(key)) return true;
  recentDedupeKeys.add(key);
  if (recentDedupeKeys.size > RECENT_CAP) {
    const firstKey = recentDedupeKeys.keys().next().value;
    if (firstKey !== undefined) recentDedupeKeys.delete(firstKey);
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

async function resolveBridgeWorkspacePathForBot(bot: FeishuBotConfig): Promise<string> {
  const raw = String(bot.bridgeWorkspacePath ?? '').trim();
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

async function handleImText(
  params: {
    text: string;
    messageId: string;
    replyReceiveId: string;
    replyReceiveIdType: FeishuReceiveIdType;
  },
  bot: FeishuBotConfig
): Promise<void> {
  if (!bot.bridgeEnabled) return;

  const wsRoot = await resolveBridgeWorkspacePathForBot(bot);
  const engine = getGlobalClawFlowEngine();
  const store = new SessionStore(wsRoot);
  const conversationId = await resolveConversationId(store, bot.bridgeConversationId);
  if (!conversationId) {
    console.warn(`[feishu-ws] bot=${bot.id} no conversation id`);
    return;
  }

  if (params.messageId && rememberDedupeKey(bot.id, params.messageId)) {
    return;
  }

  const senderLabel = String(bot.bridgeSenderLabel ?? 'Feishu').trim() || 'Feishu';

  await engine.appendPersistedUserMessage({
    workspaceRoot: wsRoot,
    conversationId,
    content: params.text,
    channel: 'user_feishu',
    meta: { source: 'feishu', senderLabel, feishuBotId: bot.id },
  });
  console.log(
    `[feishu-ws] inbound bot=${bot.id} workspace=${wsRoot} conversation=${conversationId} preview=${params.text.slice(0, 80)}`,
  );
  broadcastChatConversationsDirty({ workspaceRoot: wsRoot });

  const { appId, appSecret } = resolveFeishuAppCredentials({ botId: bot.id });
  if (!appId || !appSecret) {
    console.warn(`[feishu-ws] bot=${bot.id} missing app credentials, skip AI + reply`);
    return;
  }

  let replyText = '';
  try {
    const res = await engine.sendMessage({
      conversationId,
      userText: params.text,
      mode: 'multitask',
      workspaceRoot: wsRoot,
      assistantMessageMeta: { source: 'feishu_bridge', feishuBotId: bot.id },
    });
    replyText = formatAssistantReplyForFeishu(res.message ?? '');
  } catch (e: unknown) {
    console.error(`[feishu-ws] bot=${bot.id} sendMessage failed:`, e instanceof Error ? e.message : e);
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
    console.error(`[feishu-ws] bot=${bot.id} reply to Feishu failed:`, e instanceof Error ? e.message : e);
  }

  broadcastChatConversationsDirty({ workspaceRoot: wsRoot });
}

function onSdkImMessageReceive(data: unknown, bot: FeishuBotConfig): void {
  try {
    const extracted = extractFromSdkImReceive(data);
    if (!extracted) {
      console.warn(`[feishu-ws] bot=${bot.id} im.message.receive_v1: could not parse payload`);
      return;
    }
    if (extracted.skipReason) {
      console.log(`[feishu-ws] bot=${bot.id} skipped: ${extracted.skipReason}`);
      return;
    }
    console.log(`[feishu-ws] bot=${bot.id} enqueue inbound message_id=${extracted.messageId} len=${extracted.text.length}`);
    enqueueFeishuInbound(() =>
      handleImText(
        {
          text: extracted.text,
          messageId: extracted.messageId,
          replyReceiveId: extracted.replyReceiveId,
          replyReceiveIdType: extracted.replyReceiveIdType,
        },
        bot
      )
    );
  } catch (e: unknown) {
    console.error(`[feishu-ws] bot=${bot.id} handler error:`, e instanceof Error ? e.message : e);
  }
}

export function stopFeishuEventServer(): void {
  for (const [id, c] of [...wsClients.entries()]) {
    try {
      c.close({ force: true });
    } catch {
      /* ignore */
    }
    wsClients.delete(id);
  }
}

export function restartFeishuEventServerFromPrefs(): void {
  stopFeishuEventServer();
  const prefs = readMessagingPrefsFile();
  const bots = getNormalizedFeishuBots(prefs);
  const toStart = bots.filter((b) => b.bridgeEnabled);
  if (toStart.length === 0) {
    console.log('[feishu-ws] 无启用桥接的飞书机器人，长连接未启动。');
    return;
  }

  const Lark = loadLarkSdk();
  if (!Lark) {
    return;
  }

  let scheduled = 0;
  for (const bot of toStart) {
    const { appId, appSecret } = resolveFeishuAppCredentials({ botId: bot.id });
    if (!appId || !appSecret) {
      console.warn(`[feishu-ws] 跳过机器人「${bot.name}」(${bot.id})：缺少 App ID / Secret。`);
      continue;
    }

    const client = new Lark.WSClient({
      appId,
      appSecret,
      domain: Lark.Domain.Feishu,
      loggerLevel: Lark.LoggerLevel.info,
      onError: (e: unknown) => {
        console.error(`[feishu-ws] bot=${bot.id} client onError:`, e instanceof Error ? e.message : e);
      },
    });

    const dispatcher = new Lark.EventDispatcher({}).register({
      'im.message.receive_v1': async (data: unknown) => {
        onSdkImMessageReceive(data, bot);
      },
    });

    wsClients.set(bot.id, client);
    scheduled++;
    void (async () => {
      try {
        await client.start({ eventDispatcher: dispatcher });
        console.log(
          `[feishu-ws] 已连接：${bot.name}（${bot.id}）。请在开放平台将该应用订阅设为「使用长连接接收事件」。`,
        );
      } catch (e: unknown) {
        console.error(`[feishu-ws] WSClient.start 失败 bot=${bot.id}:`, e instanceof Error ? e.message : e);
        try {
          client.close({ force: true });
        } catch {
          /* ignore */
        }
        wsClients.delete(bot.id);
      }
    })();
  }

  if (scheduled === 0) {
    console.warn('[feishu-ws] 已勾选桥接的机器人均未配置有效凭证，长连接未建立。');
  }
}
