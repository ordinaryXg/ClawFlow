/**
 * 飞书 IM 桥接：lark-cli `event consume im.message.receive_v1` + `im +messages-send`。
 */

import * as path from 'path';
import { spawn, type ChildProcessWithoutNullStreams } from 'child_process';
import {
  readMessagingPrefsFile,
  getNormalizedFeishuBots,
  type FeishuBotConfig,
  type FeishuReceiveIdType,
} from '../main/prefs/messaging-prefs';
import * as workspaceService from '../main/workspace/workspace-service';
import { getGlobalClawFlowEngine } from '../engine/clawflow-engine';
import { SessionStore } from '../engine/session-store';
import { formatAssistantReplyForFeishu } from './feishu-outbound-text';
import { broadcastChatConversationsDirty } from './chat-broadcast';
import { extractInboundFromEventConsumeLine } from './feishu-inbound-parse';
import { buildLarkCliEnv } from '../main/lark-cli/lark-cli-env';
import { ensureLarkCliBinaryInstalled } from '../main/lark-cli/lark-cli-runner';
import { profileNameForBotId } from '../main/lark-cli/lark-cli-path';
import { buildEventConsumeArgv } from '../main/lark-cli/lark-cli-whitelist';
import { sendFeishuTextViaLarkCli } from '../main/lark-cli/lark-cli-invoke';
import { syncLarkCliProfilesFromBots } from '../main/lark-cli/lark-cli-config-sync';

type BridgeConsumer = {
  botId: string;
  child: ChildProcessWithoutNullStreams;
  ready: boolean;
};

const consumers = new Map<string, BridgeConsumer>();
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
    console.error('[lark-bridge] inbound job failed:', e instanceof Error ? e.message : e);
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
    console.warn(`[lark-bridge] bot=${bot.id} no conversation id`);
    return;
  }

  if (params.messageId && rememberDedupeKey(bot.id, params.messageId)) {
    console.log(`[lark-bridge] bot=${bot.id} skip duplicate message_id=${params.messageId}`);
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

  if (!String(bot.appId ?? '').trim() || !String(bot.appSecret ?? '').trim()) {
    console.warn(`[lark-bridge] bot=${bot.id} missing app credentials, skip AI + reply`);
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
    console.error(`[lark-bridge] bot=${bot.id} sendMessage failed:`, e instanceof Error ? e.message : e);
    replyText = `【ClawFlow】处理失败：${e instanceof Error ? e.message : String(e)}`;
  }

  if (!replyText.trim()) return;

  try {
    await sendFeishuTextViaLarkCli({
      botId: bot.id,
      receiveIdType: params.replyReceiveIdType,
      receiveId: params.replyReceiveId,
      text: replyText,
    });
  } catch (e: unknown) {
    console.error(`[lark-bridge] bot=${bot.id} reply to Feishu failed:`, e instanceof Error ? e.message : e);
  }

  broadcastChatConversationsDirty({ workspaceRoot: wsRoot });
}

function onEventLine(line: string, bot: FeishuBotConfig): void {
  try {
    const extracted = extractInboundFromEventConsumeLine(line);
    if (!extracted) return;
    if (extracted.skipReason) {
      console.log(`[lark-bridge] bot=${bot.id} skip: ${extracted.skipReason}`);
      return;
    }
    console.log(
      `[lark-bridge] bot=${bot.id} enqueue inbound textLen=${extracted.text.length} replyType=${extracted.replyReceiveIdType}`
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
    console.error(`[lark-bridge] bot=${bot.id} handler error:`, e instanceof Error ? e.message : e);
  }
}

async function startConsumerForBot(bot: FeishuBotConfig): Promise<void> {
  if (!String(bot.appId ?? '').trim() || !String(bot.appSecret ?? '').trim()) {
    console.warn(`[lark-bridge] Skipping bot "${bot.name}" (${bot.id}): missing App ID / Secret.`);
    return;
  }

  const binaryPath = await ensureLarkCliBinaryInstalled();
  const profile = profileNameForBotId(bot.id);
  const argv = buildEventConsumeArgv('im.message.receive_v1', 'bot', profile);
  const env = buildLarkCliEnv();

  console.log(`[lark-bridge] starting event consume for bot=${bot.id} name="${bot.name}" profile=${profile}`);

  const child = spawn(binaryPath, argv, {
    env,
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
  });

  const consumer: BridgeConsumer = { botId: bot.id, child, ready: false };
  consumers.set(bot.id, consumer);

  let stdoutBuf = '';
  child.stdout.on('data', (chunk: Buffer) => {
    stdoutBuf += chunk.toString('utf8');
    let idx: number;
    while ((idx = stdoutBuf.indexOf('\n')) >= 0) {
      const line = stdoutBuf.slice(0, idx);
      stdoutBuf = stdoutBuf.slice(idx + 1);
      if (consumer.ready) onEventLine(line, bot);
    }
  });

  child.stderr.on('data', (chunk: Buffer) => {
    const text = chunk.toString('utf8');
    for (const line of text.split('\n')) {
      if (line.includes('[event] ready')) {
        consumer.ready = true;
        console.log(`[lark-bridge] bot=${bot.id} event consume ready`);
      } else if (line.trim()) {
        console.log(`[lark-bridge] bot=${bot.id} stderr: ${line.trim()}`);
      }
    }
  });

  child.on('close', (code) => {
    consumers.delete(bot.id);
    console.warn(`[lark-bridge] bot=${bot.id} event consume exited code=${code ?? '?'}`);
  });

  child.on('error', (e) => {
    consumers.delete(bot.id);
    console.error(`[lark-bridge] bot=${bot.id} spawn error:`, e.message);
  });
}

export function stopLarkBridge(): void {
  for (const [id, c] of [...consumers.entries()]) {
    try {
      c.child.stdin?.end();
      c.child.kill('SIGTERM');
    } catch {
      /* ignore */
    }
    consumers.delete(id);
  }
}

export function restartLarkBridgeFromPrefs(): void {
  stopLarkBridge();
  const prefs = readMessagingPrefsFile();
  const bots = getNormalizedFeishuBots(prefs);
  const toStart = bots.filter((b) => b.bridgeEnabled);
  console.log(
    `[lark-bridge] restart: ${bots.length} bot(s), ${toStart.length} with bridge enabled`
  );
  if (toStart.length === 0) {
    console.log('[lark-bridge] no bridge-enabled bots');
    return;
  }

  void (async () => {
    const sync = await syncLarkCliProfilesFromBots(bots);
    if (sync.errors.length) {
      console.warn('[lark-bridge] profile sync warnings:', sync.errors.join('; '));
    }
    for (const bot of toStart) {
      try {
        await startConsumerForBot(bot);
      } catch (e: unknown) {
        console.error(`[lark-bridge] failed to start bot=${bot.id}:`, e instanceof Error ? e.message : e);
      }
    }
  })();
}

/** @deprecated alias */
export const stopFeishuEventServer = stopLarkBridge;
/** @deprecated alias */
export const restartFeishuEventServerFromPrefs = restartLarkBridgeFromPrefs;
