import { ipcMain } from 'electron';
import {
  coerceFeishuReceiveIdType,
  readMessagingPrefsFile,
  writeMessagingPrefsFile,
  type FeishuReceiveIdType,
  type MessagingPrefsStored,
} from '../messaging-prefs';
import { feishuGetTenantAccessToken, feishuSendTextMessage, FeishuRequestError, resolveFeishuAppCredentials } from './feishu-api';
import { restartFeishuEventServerFromPrefs } from './feishu-event-server';

const MESSAGING_IPC_CHANNELS = [
  'messaging:getFeishuSettings',
  'messaging:saveFeishuSettings',
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

export function registerMessagingIPC(): void {
  for (const ch of MESSAGING_IPC_CHANNELS) {
    ipcMain.removeHandler(ch);
  }

  ipcMain.handle('messaging:getFeishuSettings', async () => {
    const file = readMessagingPrefsFile();
    const f = file?.feishu;
    const appSecretSavedInFile = Boolean(
      f && Object.prototype.hasOwnProperty.call(f, 'appSecret') && String(f.appSecret ?? '').trim().length > 0
    );
    const { appId, appSecret } = resolveFeishuAppCredentials();
    return {
      appId: String(f?.appId ?? '').trim(),
      appSecretConfigured: Boolean(appSecret),
      appSecretSavedInFile,
      defaultReceiveId: String(f?.defaultReceiveId ?? '').trim(),
      receiveIdType: coerceFeishuReceiveIdType(f?.receiveIdType),
      bridgeEnabled: Boolean(f?.bridgeEnabled),
      bridgeWorkspacePath: String(f?.bridgeWorkspacePath ?? '').trim(),
      bridgeConversationId: String(f?.bridgeConversationId ?? '').trim(),
      bridgeSenderLabel: String(f?.bridgeSenderLabel ?? '').trim(),
    };
  });

  ipcMain.handle('messaging:saveFeishuSettings', async (_e, payload: unknown) => {
    const p = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
    const cur: MessagingPrefsStored = { ...(readMessagingPrefsFile() ?? {}) };
    const fe = { ...(cur.feishu ?? {}) };

    if (typeof p.appId === 'string') {
      const t = p.appId.trim();
      if (t) fe.appId = t;
      else delete fe.appId;
    }
    if (typeof p.appSecret === 'string' && p.appSecret.trim()) {
      fe.appSecret = p.appSecret.trim();
    } else if (p.clearAppSecret === true) {
      delete fe.appSecret;
    }
    if (typeof p.defaultReceiveId === 'string') {
      const t = p.defaultReceiveId.trim();
      if (t) fe.defaultReceiveId = t;
      else delete fe.defaultReceiveId;
    }
    if (p.receiveIdType === 'open_id' || p.receiveIdType === 'user_id' || p.receiveIdType === 'union_id' || p.receiveIdType === 'email' || p.receiveIdType === 'chat_id') {
      fe.receiveIdType = p.receiveIdType;
    }

    if (typeof p.bridgeEnabled === 'boolean') {
      fe.bridgeEnabled = p.bridgeEnabled;
    }
    if (typeof p.bridgeWorkspacePath === 'string') {
      const bt = p.bridgeWorkspacePath.trim();
      if (bt) fe.bridgeWorkspacePath = bt;
      else delete fe.bridgeWorkspacePath;
    }
    if (typeof p.bridgeConversationId === 'string') {
      const bt = p.bridgeConversationId.trim();
      if (bt) fe.bridgeConversationId = bt;
      else delete fe.bridgeConversationId;
    }
    if (typeof p.bridgeSenderLabel === 'string') {
      const bt = p.bridgeSenderLabel.trim();
      if (bt) fe.bridgeSenderLabel = bt;
      else delete fe.bridgeSenderLabel;
    }

    delete (fe as Record<string, unknown>)['bridgeEventListenPort'];
    delete (fe as Record<string, unknown>)['bridgeEventVerificationToken'];

    if (Object.keys(fe).length === 0) {
      delete cur.feishu;
    } else {
      cur.feishu = fe;
    }
    writeMessagingPrefsFile(cur);
    restartFeishuEventServerFromPrefs();
    return { ok: true as const };
  });

  ipcMain.handle('messaging:testFeishu', async (_e, payload: unknown) => {
    const p = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
    const oAppId = typeof p.appId === 'string' ? p.appId : undefined;
    const oSecret = typeof p.appSecret === 'string' ? p.appSecret : undefined;
    const { appId, appSecret } = resolveFeishuAppCredentials({
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
    const file = readMessagingPrefsFile();
    const receiveId = String(
      (typeof p.receiveId === 'string' ? p.receiveId : undefined) ?? file?.feishu?.defaultReceiveId ?? ''
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
        : coerceFeishuReceiveIdType(file?.feishu?.receiveIdType);

    const oAppId = typeof p.appId === 'string' ? p.appId : undefined;
    const oSecret = typeof p.appSecret === 'string' ? p.appSecret : undefined;
    const { appId, appSecret } = resolveFeishuAppCredentials({
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
      const ctx = { receiveIdType, receiveId, textLength: text.length };
      const { error, detail } = feishuIpcFailure(e, 'sendFeishuTestMessage');
      const detailWithCtx = `${detail}\n\n${JSON.stringify({ requestContext: ctx }, null, 2)}`;
      console.error('[messaging:sendFeishuTestMessage] request context', ctx);
      return { ok: false as const, error, detail: detailWithCtx };
    }
  });
}
