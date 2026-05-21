/** Allowed top-level lark-cli domains for Agent / bridge invoke. */
export const LARK_CLI_ALLOWED_DOMAINS = new Set([
  'auth',
  'api',
  'docs',
  'base',
  'drive',
  'wiki',
  'im',
  'event',
  'calendar',
  'contact',
  'task',
  'mail',
  'sheets',
  'config',
]);

const BLOCKED_ARG_PATTERNS = [/[;&|`$]/, /\.\./];

/** `api` 域禁止的全量表格路径（易返回整表网格，撑爆上下文） */
const LARK_CLI_BLOCKED_API_PATH_PATTERNS: readonly RegExp[] = [
  /\/sheets\/v3\/spreadsheets\/[^/]+\/sheets\/query\b/i,
  /\/sheets\/v2\/spreadsheets\/[^/]+\/values_batch_get\b/i,
  /\/sheets\/v3\/spreadsheets\/[^/]+\/sheets\/values_batch_get\b/i,
];

function extractOpenApiPathFromArgs(args: readonly string[]): string | null {
  for (const raw of args) {
    const s = String(raw ?? '').trim();
    if (s.startsWith('/open-apis/')) return s.split('?')[0] ?? s;
  }
  return null;
}

function validateApiDomainArgs(args: readonly string[]): { ok: true } | { ok: false; error: string } {
  const apiPath = extractOpenApiPathFromArgs(args);
  if (!apiPath) return { ok: true };
  for (const pat of LARK_CLI_BLOCKED_API_PATH_PATTERNS) {
    if (pat.test(apiPath)) {
      return {
        ok: false,
        error: `api_path_blocked: ${apiPath}. Use domain "sheets" (+info, +read --range, +find) instead of full grid query.`,
      };
    }
  }
  return { ok: true };
}

export type LarkCliInvokeRequest = {
  domain: string;
  args: string[];
  as?: 'user' | 'bot';
  profile?: string;
  yes?: boolean;
  dryRun?: boolean;
  format?: 'json' | 'ndjson' | 'table' | 'csv' | 'pretty';
};

export function validateLarkCliInvokeRequest(req: LarkCliInvokeRequest): { ok: true } | { ok: false; error: string } {
  const domain = String(req.domain ?? '').trim().toLowerCase();
  if (!domain) return { ok: false, error: 'missing_domain' };
  if (!LARK_CLI_ALLOWED_DOMAINS.has(domain)) return { ok: false, error: `domain_not_allowed:${domain}` };

  const args = Array.isArray(req.args) ? req.args.map((a) => String(a)) : [];
  if (args.length === 0 && domain !== 'auth' && domain !== 'config') {
    return { ok: false, error: 'missing_args' };
  }
  for (const arg of args) {
    for (const pat of BLOCKED_ARG_PATTERNS) {
      if (pat.test(arg)) return { ok: false, error: 'unsafe_arg' };
    }
  }
  if (domain === 'api') {
    const apiCheck = validateApiDomainArgs(args);
    if (!apiCheck.ok) return apiCheck;
  }
  if (req.as && req.as !== 'user' && req.as !== 'bot') return { ok: false, error: 'invalid_as' };
  return { ok: true };
}

/** Domains whose leaf subcommands accept trailing --as / --format (auth/event/config do not). */
const LARK_CLI_INVOKE_FLAG_DOMAINS = new Set([
  'api',
  'docs',
  'base',
  'drive',
  'wiki',
  'im',
  'calendar',
  'contact',
  'task',
  'mail',
  'sheets',
]);

/** Domains where buildLarkCliArgv may append `--format json` (sheets + shortcuts do NOT support --format). */
const LARK_CLI_AUTO_FORMAT_DOMAINS = new Set(['api', 'docs', 'base', 'drive', 'wiki']);

export function larkCliDomainSupportsFormatFlag(domain: string): boolean {
  return LARK_CLI_AUTO_FORMAT_DOMAINS.has(String(domain ?? '').trim().toLowerCase());
}

export function buildLarkCliArgv(req: LarkCliInvokeRequest): string[] {
  const domain = req.domain.trim().toLowerCase();
  const argv: string[] = [];
  if (req.profile) argv.push('--profile', req.profile);
  argv.push(domain);
  argv.push(...req.args.map(String));
  if (LARK_CLI_INVOKE_FLAG_DOMAINS.has(domain)) {
    if (req.as) argv.push('--as', req.as);
    if (req.format) {
      if (larkCliDomainSupportsFormatFlag(domain)) argv.push('--format', req.format);
    } else if (LARK_CLI_AUTO_FORMAT_DOMAINS.has(domain)) {
      argv.push('--format', 'json');
    }
  }
  if (req.dryRun) argv.push('--dry-run');
  if (req.yes) argv.push('--yes');
  return argv;
}

/** IM bridge long-running consume — not via invoke whitelist timing limits. */
export function buildEventConsumeArgv(eventKey: string, as: 'user' | 'bot', profile?: string): string[] {
  const argv: string[] = [];
  if (profile) argv.push('--profile', profile);
  // consume streams NDJSON to stdout; it has no --format flag
  argv.push('event', 'consume', eventKey, '--as', as);
  return argv;
}

/** Bot reply via lark-cli im shortcut. */
export function buildImSendTextArgv(params: {
  receiveIdType: string;
  receiveId: string;
  text: string;
  profile?: string;
}): string[] {
  const argv: string[] = [];
  if (params.profile) argv.push('--profile', params.profile);
  argv.push('im', '+messages-send', '--as', 'bot');
  const type = String(params.receiveIdType ?? '').toLowerCase();
  if (type === 'chat_id') {
    argv.push('--chat-id', params.receiveId);
  } else if (type === 'open_id' || type === 'user_id' || type === 'union_id') {
    argv.push('--user-id', params.receiveId);
  } else {
    argv.push('--chat-id', params.receiveId);
  }
  argv.push('--text', params.text);
  return argv;
}

/** auth status emits JSON by default; only --verify is supported besides --help. */
export function buildAuthStatusArgv(profile?: string, options?: { verify?: boolean }): string[] {
  const argv: string[] = [];
  if (profile) argv.push('--profile', profile);
  argv.push('auth', 'status');
  if (options?.verify) argv.push('--verify');
  return argv;
}

/** Verify bot App ID / Secret via open-apis bot info. */
export function buildBotInfoTestArgv(profile?: string): string[] {
  const argv: string[] = [];
  if (profile) argv.push('--profile', profile);
  argv.push('api', 'GET', '/open-apis/bot/v3/info', '--as', 'bot', '--format', 'json');
  return argv;
}

/** Business domains passed to `auth login --domain` (additive with --scope). */
export const LARK_CLI_OAUTH_DOMAINS = 'all';

/** Explicit user OAuth scopes (space-separated). Combined with --domain all. */
export const LARK_CLI_USER_SCOPE_LIST = [
  // 新版 docx / wiki node（读云文档、Wiki 节点）
  'docx:document:readonly',
  'docx:document',
  'wiki:node:retrieve',
  'wiki:node:read',
  // 经典 docs / drive / base / wiki
  'docs:doc:readonly',
  'docs:doc',
  'docs:document.media:download',
  'drive:drive',
  'drive:drive:readonly',
  'bitable:app',
  'bitable:app:readonly',
  'wiki:wiki',
  'wiki:wiki:readonly',
  // IM（Bot 桥与用户发消息）
  'im:message',
  'im:message:send_as_bot',
  'im:chat',
  'im:chat:readonly',
] as const;

export const LARK_CLI_DEFAULT_USER_SCOPES = LARK_CLI_USER_SCOPE_LIST.join(' ');

export function buildAuthLoginStartArgv(scopes: string, profile?: string): string[] {
  const argv: string[] = [];
  if (profile) argv.push('--profile', profile);
  argv.push(
    'auth',
    'login',
    '--domain',
    LARK_CLI_OAUTH_DOMAINS,
    '--scope',
    scopes,
    '--no-wait',
    '--json'
  );
  return argv;
}

export function buildAuthLoginCompleteArgv(deviceCode: string, profile?: string): string[] {
  const argv: string[] = [];
  if (profile) argv.push('--profile', profile);
  argv.push('auth', 'login', '--device-code', deviceCode, '--json');
  return argv;
}
