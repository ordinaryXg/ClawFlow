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
      '[feishu-ws] @larksuiteoapi/node-sdk missing or failed to load; Feishu WS skipped. Install with: npm install @larksuiteoapi/node-sdk',
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

/**
 * 将 WS SDK 传入的 data 归一成与 HTTP 事件订阅一致的 2.0 信封（部分版本为扁平结构：message/sender 在顶层）。
 */
function normalizeSdkImPayloadToHttpEnvelope(data: unknown): Record<string, unknown> | null {
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

/** SDK 回调的 data 经归一化后走与 HTTP 相同的解析逻辑 */
function extractFromSdkImReceive(data: unknown): {
  text: string;
  messageId: string;
  replyReceiveId: string;
  replyReceiveIdType: FeishuReceiveIdType;
  skipReason?: string;
} | null {
  const envelope = normalizeSdkImPayloadToHttpEnvelope(data);
  if (!envelope) return null;
  return extractInboundText(envelope);
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

  return {
    text,
    messageId,
    replyReceiveId,
    replyReceiveIdType,
  };
}

async function resolveBridgeWorkspacePathForBot(bot: FeishuBotConfig): Promise<string> {
  const raw = String(bot.bridgeWorkspacePath ?? '').trim();
  if (raw) return path.resolve(raw);
  const reg = workspaceService.loadRegistry();
  const active = reg.activeWorkspacePath?.trim();
  if (active) return path.resolve(active);
  throw new Error('no_active_workspace');
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
    console.log(`[feishu-ws] bot=${bot.id} skip duplicate message_id=${params.messageId}`);
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
    console.log(`[feishu-ws] bot=${bot.id} im.message.receive_v1 callback`);
    const extracted = extractFromSdkImReceive(data);
    if (!extracted) {
      const hint =
        typeof data === 'object' && data !== null
          ? ` keys=${Object.keys(data as Record<string, unknown>).slice(0, 12).join(',')}`
          : '';
      console.warn(`[feishu-ws] bot=${bot.id} im.message.receive_v1: could not parse payload${hint}`);
      return;
    }
    if (extracted.skipReason) {
      console.log(`[feishu-ws] bot=${bot.id} skip: ${extracted.skipReason}`);
      return;
    }
    console.log(
      `[feishu-ws] bot=${bot.id} enqueue inbound textLen=${extracted.text.length} replyType=${extracted.replyReceiveIdType}`
    );
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
  console.log(
    `[feishu-ws] restart: ${bots.length} bot(s) in prefs, ${toStart.length} with「事件桥接」开启（日志在启动 Electron 的终端/主进程，不是浏览器 F12）`
  );
  if (toStart.length === 0) {
    console.log('[feishu-ws] 未启动长连接：请在设置里为需要收消息的机器人打开「事件桥接」并保存。');
    return;
  }

  const Lark = loadLarkSdk();
  if (!Lark) {
    console.warn('[feishu-ws] 未启动长连接：未加载 @larksuiteoapi/node-sdk（请 npm install 后重启应用）。');
    return;
  }

  let scheduled = 0;
  for (const bot of toStart) {
    const { appId, appSecret } = resolveFeishuAppCredentials({ botId: bot.id });
    if (!appId || !appSecret) {
      console.warn(`[feishu-ws] Skipping bot "${bot.name}" (${bot.id}): missing App ID / Secret.`);
      continue;
    }

    console.log(`[feishu-ws] starting WSClient for bot=${bot.id} name="${bot.name}" appId=${appId.slice(0, 6)}…`);

    const client = new Lark.WSClient({
      appId,
      appSecret,
      domain: Lark.Domain.Feishu,
      // Avoid SDK info logs (channel `[ws]`) with embedded CJK — Windows consoles often mis-decode UTF-8 as GBK.
      loggerLevel: Lark.LoggerLevel.warn,
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
        console.log(`[feishu-ws] bot=${bot.id} WSClient.start ok (long connection ready)`);
      } catch (e: unknown) {
        console.error(`[feishu-ws] WSClient.start failed bot=${bot.id}:`, e instanceof Error ? e.message : e);
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
    console.warn(
      '[feishu-ws] 已开启桥接的机器人均未配置有效 App ID/Secret，长连未建立。请检查设置里每条机器人的凭证。'
    );
  } else {
    console.log(`[feishu-ws] 已调度 ${scheduled} 个 WSClient，连接成功后会有「WSClient.start ok」日志。`);
  }
}
