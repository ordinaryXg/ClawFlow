import { ipcMain } from 'electron';
import {
  coerceFeishuReceiveIdType,
  findFeishuBotById,
  getNormalizedFeishuBots,
  mergeFeishuBotsPreserveSecrets,
  readMessagingPrefsFile,
  writeMessagingPrefsFile,
  type FeishuBotConfig,
  type FeishuReceiveIdType,
  type MessagingPrefsStored,
} from '../main/prefs/messaging-prefs';
import { feishuGetTenantAccessToken, feishuSendTextMessage, FeishuRequestError, resolveFeishuAppCredentials } from './feishu-api';
import { restartFeishuEventServerFromPrefs } from './feishu-event-server';

const MESSAGING_IPC_CHANNELS = [
  'messaging:getFeishuBots',
  'messaging:saveFeishuBots',
  'messaging:testFeishu',
  'messaging:sendFeishuTestMessage',
] as const;

function feishuIpcFailure(e: unknown, logTag: string): { error: string; detail: string } {
  if (e instanceof FeishuRequestError) {
    const detail = e.detailJson();
    console.error(`[messaging:${logTag}]`, e.message, '\n', detail);
    return { error: e.message, detail };
  }
  const msg = e instanceof Error ? e.message : String(e);
  const stack = e instanceof Error ? e.stack ?? '' : '';
  const detail = JSON.stringify({ message: msg, stack }, null, 2);
  console.error(`[messaging:${logTag}]`, msg, stack ? `\n${stack}` : '');
  return { error: msg, detail };
}

function botToPublicApi(b: FeishuBotConfig): {
  id: string;
  name: string;
  appId: string;
  appSecretConfigured: boolean;
  appSecretSavedInFile: boolean;
  defaultReceiveId: string;
  receiveIdType: FeishuReceiveIdType;
  bridgeEnabled: boolean;
  bridgeWorkspacePath: string;
  bridgeConversationId: string;
  bridgeSenderLabel: string;
} {
  const secretInFile = Boolean(
    Object.prototype.hasOwnProperty.call(b, 'appSecret') && String(b.appSecret ?? '').trim().length > 0
  );
  const { appSecret, ...rest } = b;
  void appSecret;
  const hasSecret = Boolean(String(b.appSecret ?? '').trim());
  return {
    id: b.id,
    name: String(b.name ?? '').trim() || '飞书机器人',
    appId: String(b.appId ?? '').trim(),
    appSecretConfigured: hasSecret,
    appSecretSavedInFile: secretInFile,
    defaultReceiveId: String(b.defaultReceiveId ?? '').trim(),
    receiveIdType: coerceFeishuReceiveIdType(b.receiveIdType),
    bridgeEnabled: Boolean(b.bridgeEnabled),
    bridgeWorkspacePath: String(b.bridgeWorkspacePath ?? '').trim(),
    bridgeConversationId: String(b.bridgeConversationId ?? '').trim(),
    bridgeSenderLabel: String(b.bridgeSenderLabel ?? '').trim(),
  };
}

function parseIncomingBot(o: Record<string, unknown>): FeishuBotConfig | null {
  const id = typeof o.id === 'string' ? o.id.trim() : '';
  if (!id) return null;
  const name = typeof o.name === 'string' ? o.name.trim() : '';
  const fe: FeishuBotConfig = {
    id,
    name: name || '飞书机器人',
  };
  if (typeof o.appId === 'string' && o.appId.trim()) fe.appId = o.appId.trim();
  if (typeof o.appSecret === 'string' && o.appSecret.trim()) fe.appSecret = o.appSecret.trim();
  if (typeof o.defaultReceiveId === 'string' && o.defaultReceiveId.trim()) fe.defaultReceiveId = o.defaultReceiveId.trim();
  if (
    o.receiveIdType === 'open_id' ||
    o.receiveIdType === 'user_id' ||
    o.receiveIdType === 'union_id' ||
    o.receiveIdType === 'email' ||
    o.receiveIdType === 'chat_id'
  ) {
    fe.receiveIdType = o.receiveIdType;
  }
  if (typeof o.bridgeEnabled === 'boolean') fe.bridgeEnabled = o.bridgeEnabled;
  if (typeof o.bridgeWorkspacePath === 'string' && o.bridgeWorkspacePath.trim()) {
    fe.bridgeWorkspacePath = o.bridgeWorkspacePath.trim();
  }
  if (typeof o.bridgeConversationId === 'string' && o.bridgeConversationId.trim()) {
    fe.bridgeConversationId = o.bridgeConversationId.trim();
  }
  if (typeof o.bridgeSenderLabel === 'string' && o.bridgeSenderLabel.trim()) {
    fe.bridgeSenderLabel = o.bridgeSenderLabel.trim();
  }
  if (o.clearAppSecret === true) {
    (fe as Record<string, unknown>)['_clearAppSecret'] = true;
  }
  return fe;
}

export function registerMessagingIPC(): void {
  for (const ch of MESSAGING_IPC_CHANNELS) {
    ipcMain.removeHandler(ch);
  }

  ipcMain.handle('messaging:getFeishuBots', async () => {
    const file = readMessagingPrefsFile();
    const bots = getNormalizedFeishuBots(file);
    return { bots: bots.map(botToPublicApi) };
  });

  ipcMain.handle('messaging:saveFeishuBots', async (_e, payload: unknown) => {
    const p = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
    const rawBots = p.bots;
    if (!Array.isArray(rawBots) || rawBots.length === 0) {
      return { ok: false as const, error: 'invalid_bots' };
    }
    const incoming: FeishuBotConfig[] = [];
    for (const row of rawBots) {
      if (!row || typeof row !== 'object') continue;
      const b = parseIncomingBot(row as Record<string, unknown>);
      if (b) incoming.push(b);
    }
    if (incoming.length === 0) return { ok: false as const, error: 'invalid_bots' };

    const cur = readMessagingPrefsFile() ?? {};
    const merged = mergeFeishuBotsPreserveSecrets(cur, incoming);
    const next: MessagingPrefsStored = {
      messagingVersion: 2,
      feishuBots: merged,
    };
    writeMessagingPrefsFile(next);
    restartFeishuEventServerFromPrefs();
    return { ok: true as const };
  });

  ipcMain.handle('messaging:testFeishu', async (_e, payload: unknown) => {
    const p = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
    const botId = typeof p.botId === 'string' ? p.botId.trim() : '';
    const oAppId = typeof p.appId === 'string' ? p.appId : undefined;
    const oSecret = typeof p.appSecret === 'string' ? p.appSecret : undefined;
    const { appId, appSecret } = resolveFeishuAppCredentials({
      botId: botId || undefined,
      appId: oAppId,
      appSecret: oSecret,
    });
    if (!appId || !appSecret) {
      console.warn('[messaging:testFeishu] missing_credentials');
      return { ok: false as const, error: 'missing_credentials' };
    }
    try {
      const { expireSeconds } = await feishuGetTenantAccessToken(appId, appSecret);
      return { ok: true as const, expireSeconds };
    } catch (e: unknown) {
      const { error, detail } = feishuIpcFailure(e, 'testFeishu');
      return { ok: false as const, error, detail };
    }
  });

  ipcMain.handle('messaging:sendFeishuTestMessage', async (_e, payload: unknown) => {
    const p = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
    const text = String(p.text ?? '').trim();
    if (!text) {
      console.warn('[messaging:sendFeishuTestMessage] empty_text');
      return { ok: false as const, error: 'empty_text' };
    }
    const botId = typeof p.botId === 'string' ? p.botId.trim() : '';
    const file = readMessagingPrefsFile();
    const bot = botId ? findFeishuBotById(file, botId) : getNormalizedFeishuBots(file)[0];
    const receiveId = String(
      (typeof p.receiveId === 'string' ? p.receiveId : undefined) ?? bot?.defaultReceiveId ?? ''
    ).trim();
    if (!receiveId) {
      console.warn('[messaging:sendFeishuTestMessage] missing_receive_id');
      return { ok: false as const, error: 'missing_receive_id' };
    }
    const receiveIdType: FeishuReceiveIdType =
      p.receiveIdType === 'open_id' ||
      p.receiveIdType === 'user_id' ||
      p.receiveIdType === 'union_id' ||
      p.receiveIdType === 'email' ||
      p.receiveIdType === 'chat_id'
        ? p.receiveIdType
        : coerceFeishuReceiveIdType(bot?.receiveIdType);

    const oAppId = typeof p.appId === 'string' ? p.appId : undefined;
    const oSecret = typeof p.appSecret === 'string' ? p.appSecret : undefined;
    const { appId, appSecret } = resolveFeishuAppCredentials({
      botId: bot?.id,
      appId: oAppId,
      appSecret: oSecret,
    });
    if (!appId || !appSecret) {
      console.warn('[messaging:sendFeishuTestMessage] missing_credentials');
      return { ok: false as const, error: 'missing_credentials' };
    }
    try {
      const { token } = await feishuGetTenantAccessToken(appId, appSecret);
      await feishuSendTextMessage({ token, receiveIdType, receiveId, text });
      return { ok: true as const };
    } catch (e: unknown) {
      const ctx = { receiveIdType, receiveId, textLength: text.length, botId: bot?.id };
      const { error, detail } = feishuIpcFailure(e, 'sendFeishuTestMessage');
      const detailWithCtx = `${detail}\n\n${JSON.stringify({ requestContext: ctx }, null, 2)}`;
      console.error('[messaging:sendFeishuTestMessage] request context', ctx);
      return { ok: false as const, error, detail: detailWithCtx };
    }
  });
}
