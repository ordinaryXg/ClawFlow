export type LarkCliConfirmationRequired = {
  type: 'confirmation_required';
  message: string;
  hint?: string;
  action?: string;
  level?: string;
};

export class LarkCliError extends Error {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly parsed?: unknown;
  readonly confirmationRequired?: LarkCliConfirmationRequired;

  constructor(
    message: string,
    opts: {
      exitCode: number;
      stdout: string;
      stderr: string;
      parsed?: unknown;
      confirmationRequired?: LarkCliConfirmationRequired;
    }
  ) {
    super(message);
    this.name = 'LarkCliError';
    this.exitCode = opts.exitCode;
    this.stdout = opts.stdout;
    this.stderr = opts.stderr;
    this.parsed = opts.parsed;
    this.confirmationRequired = opts.confirmationRequired;
  }
}

export function tryParseLarkCliJson(raw: string): unknown {
  const trimmed = String(raw ?? '').trim();
  if (!trimmed) return undefined;
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return undefined;
  }
}

/** Parse JSON from CLI output that may include log lines before/after the object. */
export function findLarkCliJsonInText(text: string): unknown | undefined {
  const trimmed = String(text ?? '').trim();
  if (!trimmed) return undefined;
  const direct = tryParseLarkCliJson(trimmed);
  if (direct !== undefined) return direct;
  const lines = trimmed.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    const parsed = tryParseLarkCliJson(lines[i]!);
    if (parsed !== undefined && typeof parsed === 'object') return parsed;
  }
  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return tryParseLarkCliJson(trimmed.slice(firstBrace, lastBrace + 1));
  }
  return undefined;
}

export function findLarkCliJsonInOutput(stdout: string, stderr: string): unknown | undefined {
  return findLarkCliJsonInText(stdout) ?? findLarkCliJsonInText(stderr);
}

const LARK_CLI_EXIT_HINTS: Record<number, string> = {
  3: 'lark-cli 授权失败 (exit 3)。请确认：① 已在浏览器完成授权；② 已保存 App ID/Secret；③ 勿重复点击「完成授权」（需重新「开始 OAuth」）；④ 飞书开放平台已为应用开通所需用户权限。',
};

export function parseLarkCliLoggedIn(json: unknown): boolean {
  if (!json || typeof json !== 'object') return false;
  const root = json as Record<string, unknown>;
  if (root.ok === false) return false;
  if (root.event === 'authorization_complete') {
    const openId = root.user_open_id ?? root.userOpenId;
    if (typeof openId === 'string' && openId.trim()) return true;
  }
  const data = root.data && typeof root.data === 'object' ? (root.data as Record<string, unknown>) : root;
  if (data.logged_in === true || data.loggedIn === true || data.authenticated === true) return true;
  const openId = data.open_id ?? data.user_open_id ?? data.openId ?? data.userOpenId;
  if (typeof openId === 'string' && openId.trim()) return true;
  if (Array.isArray(data.users) && data.users.length > 0) return true;
  if (Array.isArray(root.users) && root.users.length > 0) return true;
  return false;
}

export function formatLarkCliErrorDetail(e: LarkCliError): string {
  const parts: string[] = [];
  const parsed = e.parsed ?? findLarkCliJsonInOutput(e.stdout, e.stderr);
  if (parsed && typeof parsed === 'object') {
    const root = parsed as Record<string, unknown>;
    if (root.error && typeof root.error === 'object') {
      const err = root.error as Record<string, unknown>;
      const msg = String(err.message ?? '').trim();
      const hint = String(err.hint ?? '').trim();
      if (msg) parts.push(msg);
      if (hint) parts.push(hint);
    }
    if (root.warning && typeof root.warning === 'object') {
      const w = root.warning as Record<string, unknown>;
      const msg = String(w.message ?? '').trim();
      const hint = String(w.hint ?? '').trim();
      if (msg) parts.push(msg);
      if (hint) parts.push(hint);
    }
  }
  const stdout = String(e.stdout ?? '').trim();
  const stderr = String(e.stderr ?? '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !/^\[lark-cli\]\s*device-flow:/i.test(l))
    .join('\n')
    .trim();
  if (stdout.startsWith('{')) parts.push(stdout);
  else if (stdout) parts.push(stdout);
  if (stderr) parts.push(stderr);
  const hint = LARK_CLI_EXIT_HINTS[e.exitCode];
  if (hint && !parts.some((p) => p.includes('exit 3'))) parts.push(hint);
  return parts.filter(Boolean).join('\n\n');
}

export function extractLarkCliFailureMessage(res: {
  exitCode: number;
  stdout: string;
  stderr: string;
  json?: unknown;
}): string {
  const parsed =
    res.json ?? findLarkCliJsonInOutput(String(res.stdout ?? ''), String(res.stderr ?? ''));
  if (parsed && typeof parsed === 'object') {
    const root = parsed as Record<string, unknown>;
    if (root.ok === false && root.error && typeof root.error === 'object') {
      const err = root.error as Record<string, unknown>;
      const parts = [String(err.message ?? '').trim(), String(err.hint ?? '').trim()].filter(Boolean);
      if (parts.length) return parts.join('\n\n');
    }
    if (typeof root.message === 'string' && root.message.trim()) return root.message.trim();
  }
  const stderr = String(res.stderr ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(
      (line) =>
        line &&
        !/^\[lark-cli\]\s*device-flow:/i.test(line) &&
        !/^\[lark-cli\]\s*\[WARN\]/i.test(line)
    )
    .join('\n')
    .trim();
  if (stderr) return stderr;
  const stdout = String(res.stdout ?? '').trim();
  if (stdout && !stdout.startsWith('{')) return stdout;
  const hint = LARK_CLI_EXIT_HINTS[res.exitCode];
  if (hint) return hint;
  return `lark-cli exit ${res.exitCode}`;
}

export function extractConfirmationRequired(stderr: string, exitCode: number): LarkCliConfirmationRequired | undefined {
  if (exitCode !== 10) return undefined;
  const parsed = tryParseLarkCliJson(stderr);
  if (!parsed || typeof parsed !== 'object') return undefined;
  const root = parsed as Record<string, unknown>;
  const err = root.error && typeof root.error === 'object' ? (root.error as Record<string, unknown>) : null;
  if (!err || err.type !== 'confirmation_required') return undefined;
  const risk =
    err.risk && typeof err.risk === 'object' ? (err.risk as Record<string, unknown>) : undefined;
  return {
    type: 'confirmation_required',
    message: String(err.message ?? 'confirmation required'),
    hint: typeof err.hint === 'string' ? err.hint : undefined,
    action: typeof risk?.action === 'string' ? risk.action : undefined,
    level: typeof risk?.level === 'string' ? risk.level : undefined,
  };
}
