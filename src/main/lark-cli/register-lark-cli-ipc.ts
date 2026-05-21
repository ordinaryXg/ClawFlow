import { ipcMain } from 'electron';
import {
  completeLarkCliUserAuthLogin,
  getLarkCliAuthStatus,
  logoutLarkCliUserAuth,
  startLarkCliUserAuthLogin,
  testLarkCliBotConnection,
} from './lark-cli-auth';
import { syncLarkCliProfilesFromBots } from './lark-cli-config-sync';
import { invokeLarkCli } from './lark-cli-invoke';
import { getLarkCliRuntimeStatus } from './lark-cli-runner';
import { LARK_CLI_DEFAULT_USER_SCOPES } from './lark-cli-whitelist';
import { LarkCliError, formatLarkCliErrorDetail } from './lark-cli-errors';

const LARK_CLI_IPC_CHANNELS = [
  'larkCli:getRuntimeStatus',
  'larkCli:getAuthStatus',
  'larkCli:authLoginStart',
  'larkCli:authLoginComplete',
  'larkCli:authLogout',
  'larkCli:invoke',
] as const;

function ipcFail(e: unknown, tag: string): { ok: false; error: string; detail?: string } {
  if (e instanceof LarkCliError) {
    const detail = formatLarkCliErrorDetail(e);
    console.error(`[larkCli:${tag}]`, e.message, detail.slice(0, 4000));
    return { ok: false, error: e.message, detail };
  }
  const msg = e instanceof Error ? e.message : String(e);
  console.error(`[larkCli:${tag}]`, msg);
  return { ok: false, error: msg };
}

function readCredentialOverride(payload: Record<string, unknown>): { appId?: string; appSecret?: string } {
  const appId = typeof payload.appId === 'string' ? payload.appId.trim() : undefined;
  const appSecret = typeof payload.appSecret === 'string' ? payload.appSecret.trim() : undefined;
  return {
    ...(appId ? { appId } : {}),
    ...(appSecret ? { appSecret } : {}),
  };
}

export function registerLarkCliIPC(): void {
  for (const ch of LARK_CLI_IPC_CHANNELS) {
    ipcMain.removeHandler(ch);
  }

  ipcMain.handle('larkCli:getRuntimeStatus', async () => {
    const status = await getLarkCliRuntimeStatus();
    return { ok: true as const, ...status };
  });

  ipcMain.handle('larkCli:getAuthStatus', async (_e, payload: unknown) => {
    const p = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
    const botId = typeof p.botId === 'string' ? p.botId.trim() : '';
    const as = p.as === 'bot' ? 'bot' : 'user';
    if (!botId) return { ok: false as const, error: 'missing_bot_id' };
    try {
      const status = await getLarkCliAuthStatus(botId, as);
      return { ok: true as const, status };
    } catch (e: unknown) {
      return ipcFail(e, 'getAuthStatus');
    }
  });

  ipcMain.handle('larkCli:authLoginStart', async (_e, payload: unknown) => {
    const p = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
    const botId = typeof p.botId === 'string' ? p.botId.trim() : '';
    const scope = typeof p.scope === 'string' ? p.scope.trim() : LARK_CLI_DEFAULT_USER_SCOPES;
    if (!botId) return { ok: false as const, error: 'missing_bot_id' };
    try {
      const creds = readCredentialOverride(p);
      const started = await startLarkCliUserAuthLogin(botId, scope, creds);
      return { ok: true as const, ...started };
    } catch (e: unknown) {
      return ipcFail(e, 'authLoginStart');
    }
  });

  ipcMain.handle('larkCli:authLoginComplete', async (_e, payload: unknown) => {
    const p = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
    const botId = typeof p.botId === 'string' ? p.botId.trim() : '';
    const deviceCode = typeof p.deviceCode === 'string' ? p.deviceCode.trim() : '';
    if (!botId || !deviceCode) return { ok: false as const, error: 'missing_bot_id_or_device_code' };
    try {
      const creds = readCredentialOverride(p);
      const done = await completeLarkCliUserAuthLogin(botId, deviceCode, creds);
      return { ok: true as const, raw: done.raw, warning: done.warning, loggedIn: done.loggedIn };
    } catch (e: unknown) {
      return ipcFail(e, 'authLoginComplete');
    }
  });

  ipcMain.handle('larkCli:authLogout', async (_e, payload: unknown) => {
    const p = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
    const botId = typeof p.botId === 'string' ? p.botId.trim() : '';
    if (!botId) return { ok: false as const, error: 'missing_bot_id' };
    try {
      await logoutLarkCliUserAuth(botId);
      return { ok: true as const };
    } catch (e: unknown) {
      return ipcFail(e, 'authLogout');
    }
  });

  ipcMain.handle('larkCli:invoke', async (_e, payload: unknown) => {
    const p = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
    const domain = typeof p.domain === 'string' ? p.domain.trim() : '';
    const args = Array.isArray(p.args) ? p.args.map(String) : [];
    const botId = typeof p.botId === 'string' ? p.botId.trim() : undefined;
    const as = p.as === 'bot' ? 'bot' : p.as === 'user' ? 'user' : undefined;
    const yes = p.yes === true;
    const dryRun = p.dryRun === true;
    const format =
      p.format === 'ndjson' || p.format === 'table' || p.format === 'csv' || p.format === 'pretty'
        ? p.format
        : 'json';
    const res = await invokeLarkCli({ domain, args, botId, as, yes, dryRun, format });
    return res;
  });
}

export async function syncLarkCliAfterSaveBots(bots: Parameters<typeof syncLarkCliProfilesFromBots>[0]): Promise<void> {
  await syncLarkCliProfilesFromBots(bots);
}

export { testLarkCliBotConnection };
