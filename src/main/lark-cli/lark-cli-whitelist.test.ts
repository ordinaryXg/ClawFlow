import {
  buildAuthLoginStartArgv,
  buildAuthStatusArgv,
  buildBotInfoTestArgv,
  buildEventConsumeArgv,
  buildImSendTextArgv,
  buildLarkCliArgv,
  larkCliDomainSupportsFormatFlag,
  LARK_CLI_DEFAULT_USER_SCOPES,
  validateLarkCliInvokeRequest,
} from './lark-cli-whitelist';

describe('lark-cli-whitelist', () => {
  it('allows docs fetch shortcut args', () => {
    const req = {
      domain: 'docs',
      args: ['+fetch', '--api-version', 'v2', '--doc', 'doccnXXX'],
      as: 'user' as const,
    };
    expect(validateLarkCliInvokeRequest(req)).toEqual({ ok: true });
    const argv = buildLarkCliArgv(req);
    expect(argv).toContain('docs');
    expect(argv).toContain('+fetch');
    expect(argv).toContain('--as');
    expect(argv).toContain('user');
    expect(argv).toContain('--format');
    expect(argv).toContain('json');
  });

  it('builds event consume without unsupported --format', () => {
    expect(buildEventConsumeArgv('im.message.receive_v1', 'bot', 'bot-1')).toEqual([
      '--profile',
      'bot-1',
      'event',
      'consume',
      'im.message.receive_v1',
      '--as',
      'bot',
    ]);
  });

  it('builds auth status without --as or --format', () => {
    expect(buildAuthStatusArgv('bot-1', { verify: true })).toEqual([
      '--profile',
      'bot-1',
      'auth',
      'status',
      '--verify',
    ]);
  });

  it('builds bot connection test via api bot info', () => {
    expect(buildBotInfoTestArgv('bot-1')).toEqual([
      '--profile',
      'bot-1',
      'api',
      'GET',
      '/open-apis/bot/v3/info',
      '--as',
      'bot',
      '--format',
      'json',
    ]);
  });

  it('builds im send without --format', () => {
    const argv = buildImSendTextArgv({
      receiveIdType: 'chat_id',
      receiveId: 'oc_xxx',
      text: 'hi',
      profile: 'bot-1',
    });
    expect(argv).not.toContain('--format');
    expect(argv).toContain('--chat-id');
    expect(argv).toContain('oc_xxx');
  });

  it('builds auth login with --domain all and docx/wiki scopes', () => {
    const argv = buildAuthLoginStartArgv(LARK_CLI_DEFAULT_USER_SCOPES, 'bot-1');
    expect(argv).toContain('--domain');
    expect(argv).toContain('all');
    expect(argv).toContain('--scope');
    expect(argv.join(' ')).toContain('docx:document:readonly');
    expect(argv.join(' ')).toContain('wiki:node:retrieve');
    expect(argv).toContain('--no-wait');
    expect(argv).toContain('--json');
  });

  it('rejects shell injection in args', () => {
    const bad = validateLarkCliInvokeRequest({
      domain: 'im',
      args: ['+messages-send', ';', 'rm', '-rf', '/'],
    });
    expect(bad.ok).toBe(false);
  });

  it('rejects unknown domain', () => {
    const bad = validateLarkCliInvokeRequest({ domain: 'eval', args: ['x'] });
    expect(bad.ok).toBe(false);
  });

  it('allows sheets +read with range', () => {
    const req = {
      domain: 'sheets',
      args: ['+read', '--url', 'https://example.feishu.cn/sheets/abc', '--range', 'uHMAXl!A1:F100'],
      as: 'user' as const,
    };
    expect(validateLarkCliInvokeRequest(req)).toEqual({ ok: true });
    const argv = buildLarkCliArgv(req);
    expect(argv).toContain('sheets');
    expect(argv).toContain('+read');
    expect(argv).toContain('--as');
    expect(argv).not.toContain('--format');
  });

  it('sheets domain does not support --format flag', () => {
    expect(larkCliDomainSupportsFormatFlag('sheets')).toBe(false);
    expect(larkCliDomainSupportsFormatFlag('docs')).toBe(true);
  });

  it('blocks api sheets full grid query', () => {
    const bad = validateLarkCliInvokeRequest({
      domain: 'api',
      args: ['GET', '/open-apis/sheets/v3/spreadsheets/abc123/sheets/query', '--as', 'user'],
      as: 'user',
    });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error).toContain('api_path_blocked');
  });

  it('allows api sheets metadata GET', () => {
    const ok = validateLarkCliInvokeRequest({
      domain: 'api',
      args: ['GET', '/open-apis/sheets/v3/spreadsheets/abc123', '--as', 'user'],
      as: 'user',
    });
    expect(ok).toEqual({ ok: true });
  });
});
