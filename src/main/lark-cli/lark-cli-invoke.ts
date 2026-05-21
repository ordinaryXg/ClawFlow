import { LarkCliError } from './lark-cli-errors';
import { profileNameForBotId } from './lark-cli-path';
import { runLarkCli } from './lark-cli-runner';
import {
  buildLarkCliArgv,
  buildImSendTextArgv,
  type LarkCliInvokeRequest,
  validateLarkCliInvokeRequest,
} from './lark-cli-whitelist';

export type LarkCliInvokeResult = {
  ok: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
  json?: unknown;
  confirmationRequired?: {
    type: 'confirmation_required';
    message: string;
    hint?: string;
    action?: string;
    level?: string;
  };
};

export async function invokeLarkCli(req: LarkCliInvokeRequest & { botId?: string }): Promise<LarkCliInvokeResult> {
  const v = validateLarkCliInvokeRequest(req);
  if (!v.ok) {
    return { ok: false, exitCode: 1, stdout: '', stderr: v.error };
  }
  const profile = req.profile ?? (req.botId ? profileNameForBotId(req.botId) : undefined);
  const argv = buildLarkCliArgv({ ...req, profile });
  const res = await runLarkCli(argv, { timeoutMs: 180_000 });
  return {
    ok: res.ok,
    exitCode: res.exitCode,
    stdout: res.stdout,
    stderr: res.stderr,
    json: res.json,
    confirmationRequired: res.confirmationRequired,
  };
}

export async function sendFeishuTextViaLarkCli(params: {
  botId: string;
  receiveIdType: string;
  receiveId: string;
  text: string;
}): Promise<void> {
  const profile = profileNameForBotId(params.botId);
  const argv = buildImSendTextArgv({
    profile,
    receiveIdType: params.receiveIdType,
    receiveId: params.receiveId,
    text: params.text,
  });
  const res = await runLarkCli(argv, { timeoutMs: 60_000 });
  if (!res.ok) {
    throw new LarkCliError(res.stderr.trim() || `lark-cli im send failed (${res.exitCode})`, {
      exitCode: res.exitCode,
      stdout: res.stdout,
      stderr: res.stderr,
      parsed: res.json,
    });
  }
}
