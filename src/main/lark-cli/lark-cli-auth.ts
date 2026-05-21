import {
  buildAuthLoginCompleteArgv,
  buildAuthLoginStartArgv,
  buildAuthStatusArgv,
  buildBotInfoTestArgv,
  LARK_CLI_DEFAULT_USER_SCOPES,
} from './lark-cli-whitelist';
import { ensureLarkCliProfileForBot } from './lark-cli-bot-profile';
import { extractLarkCliFailureMessage, LarkCliError, parseLarkCliLoggedIn } from './lark-cli-errors';
import { profileNameForBotId } from './lark-cli-path';
import { runLarkCli, runLarkCliOrThrow } from './lark-cli-runner';

export type LarkCliAuthStatus = {
  ok: boolean;
  loggedIn: boolean;
  identity?: string;
  scopes?: string[];
  raw?: unknown;
};

export type LarkCliAuthCredentialOverride = { appId?: string; appSecret?: string };

function readLoginPayload(json: unknown): { warning?: string; loggedIn: boolean } {
  if (!json || typeof json !== 'object') return { loggedIn: false };
  const root = json as Record<string, unknown>;
  let warning: string | undefined;
  if (root.event === 'authorization_complete') {
    const w = root.warning && typeof root.warning === 'object' ? (root.warning as Record<string, unknown>) : null;
    const msg = String(w?.message ?? '').trim();
    const hint = String(w?.hint ?? '').trim();
    warning = [msg, hint].filter(Boolean).join('\n\n') || undefined;
    return { warning, loggedIn: parseLarkCliLoggedIn(root) };
  }
  return { loggedIn: parseLarkCliLoggedIn(root) };
}

export async function getLarkCliAuthStatus(botId?: string, as: 'user' | 'bot' = 'user'): Promise<LarkCliAuthStatus> {
  const profile = botId ? profileNameForBotId(botId) : undefined;
  const res = await runLarkCli(buildAuthStatusArgv(profile), { timeoutMs: 30_000 });
  const json = res.json;
  if (json && typeof json === 'object') {
    const root = json as Record<string, unknown>;
    const data = root.data && typeof root.data === 'object' ? (root.data as Record<string, unknown>) : root;
    const loggedIn = parseLarkCliLoggedIn(json);
    const scopesRaw = data.scopes ?? data.granted_scopes;
    const scopes = Array.isArray(scopesRaw) ? scopesRaw.map(String) : undefined;
    return {
      ok: res.ok,
      loggedIn,
      identity: typeof data.identity === 'string' ? data.identity : as,
      scopes,
      raw: json,
    };
  }
  return { ok: res.ok, loggedIn: res.ok, raw: json ?? res.stderr };
}

async function probeUserLoggedIn(botId: string): Promise<LarkCliAuthStatus> {
  const profile = profileNameForBotId(botId);
  const statusRes = await runLarkCli(buildAuthStatusArgv(profile), { timeoutMs: 30_000 });
  if (parseLarkCliLoggedIn(statusRes.json)) {
    return getLarkCliAuthStatus(botId, 'user');
  }
  const listRes = await runLarkCli(['--profile', profile, 'auth', 'list'], { timeoutMs: 30_000 });
  const listText = `${listRes.stdout}\n${listRes.stderr}`.trim();
  const looksLoggedIn =
    listRes.exitCode === 0 &&
    listText.length > 0 &&
    !/no users? logged in/i.test(listText) &&
    !/not logged in/i.test(listText);
  if (looksLoggedIn) {
    return { ok: true, loggedIn: true, raw: listText };
  }
  return getLarkCliAuthStatus(botId, 'user');
}

export async function startLarkCliUserAuthLogin(
  botId: string,
  scope?: string,
  creds?: LarkCliAuthCredentialOverride
): Promise<{ verificationUrl?: string; deviceCode?: string; raw: unknown }> {
  await ensureLarkCliProfileForBot(botId, creds);
  const profile = profileNameForBotId(botId);
  const scopes = String(scope ?? LARK_CLI_DEFAULT_USER_SCOPES).trim();
  const res = await runLarkCliOrThrow(buildAuthLoginStartArgv(scopes, profile), { timeoutMs: 30_000 });
  const json = res.json;
  if (json && typeof json === 'object') {
    const root = json as Record<string, unknown>;
    const data = root.data && typeof root.data === 'object' ? (root.data as Record<string, unknown>) : root;
    return {
      verificationUrl: String(data.verification_url ?? data.verificationUrl ?? '').trim() || undefined,
      deviceCode: String(data.device_code ?? data.deviceCode ?? '').trim() || undefined,
      raw: json,
    };
  }
  return { raw: json ?? res.stdout };
}

export async function completeLarkCliUserAuthLogin(
  botId: string,
  deviceCode: string,
  creds?: LarkCliAuthCredentialOverride
): Promise<{ ok: boolean; raw: unknown; warning?: string; loggedIn: boolean }> {
  await ensureLarkCliProfileForBot(botId, creds);
  const profile = profileNameForBotId(botId);
  const res = await runLarkCli(buildAuthLoginCompleteArgv(deviceCode, profile), { timeoutMs: 300_000 });
  const raw = res.json ?? (res.stdout.trim() || undefined);
  const payload = readLoginPayload(res.json);
  let warning = payload.warning;

  if (payload.loggedIn) {
    return { ok: true, raw: raw ?? res.json, warning, loggedIn: true };
  }

  for (const delayMs of [0, 400, 1200]) {
    if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
    const status = await probeUserLoggedIn(botId);
    if (status.loggedIn) {
      return { ok: true, raw: raw ?? status.raw, warning, loggedIn: true };
    }
  }

  if (res.ok) {
    return { ok: true, raw, warning, loggedIn: false };
  }

  throw new LarkCliError(extractLarkCliFailureMessage(res), {
    exitCode: res.exitCode,
    stdout: res.stdout,
    stderr: res.stderr,
    parsed: res.json,
    confirmationRequired: res.confirmationRequired,
  });
}

export async function logoutLarkCliUserAuth(botId: string): Promise<void> {
  const profile = profileNameForBotId(botId);
  await runLarkCliOrThrow(['--profile', profile, 'auth', 'logout'], { timeoutMs: 30_000 });
}

export async function testLarkCliBotConnection(botId: string): Promise<{ ok: boolean; raw: unknown }> {
  const profile = profileNameForBotId(botId);
  const res = await runLarkCliOrThrow(buildBotInfoTestArgv(profile), { timeoutMs: 30_000 });
  return { ok: true, raw: res.json ?? res.stdout };
}

export { ensureLarkCliProfileForBot };
