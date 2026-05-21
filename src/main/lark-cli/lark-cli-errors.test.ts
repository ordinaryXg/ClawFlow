import { extractLarkCliFailureMessage } from './lark-cli-errors';

describe('extractLarkCliFailureMessage', () => {
  it('prefers structured JSON error over device-flow stderr noise', () => {
    const msg = extractLarkCliFailureMessage({
      exitCode: 1,
      stdout: JSON.stringify({
        ok: false,
        error: {
          type: 'missing_scope',
          message: 'authorization completed, but these requested scopes were not granted: docs:doc',
          hint: 'run auth status to inspect granted scopes',
        },
      }),
      stderr: '[lark-cli] device-flow: token response received\n[lark-cli] device-flow: token response received',
    });
    expect(msg).toContain('scopes were not granted');
    expect(msg).toContain('auth status');
    expect(msg).not.toContain('token response received');
  });

  it('returns actionable hint for auth exit 3 when stderr is progress-only', () => {
    const msg = extractLarkCliFailureMessage({
      exitCode: 3,
      stdout: '',
      stderr: '[lark-cli] device-flow: token response received',
    });
    expect(msg).toContain('exit 3');
    expect(msg).not.toContain('token response received');
  });
});
