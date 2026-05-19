import { validateShellCommand, clampShellTimeoutMs, WORKSPACE_SHELL_MAX_TIMEOUT_MS } from './workspace-shell-exec';

describe('validateShellCommand', () => {
  it('rejects empty command', () => {
    expect(validateShellCommand('   ')).toMatch(/required/i);
  });

  it('accepts non-empty command', () => {
    expect(validateShellCommand('npm test')).toBeNull();
  });

  it('rejects null bytes', () => {
    expect(validateShellCommand('echo \0')).toMatch(/invalid/i);
  });
});

describe('clampShellTimeoutMs', () => {
  it('defaults when missing', () => {
    expect(clampShellTimeoutMs(undefined)).toBe(60_000);
  });

  it('clamps to max', () => {
    expect(clampShellTimeoutMs(999_999)).toBe(WORKSPACE_SHELL_MAX_TIMEOUT_MS);
  });

  it('clamps to min 1s', () => {
    expect(clampShellTimeoutMs(10)).toBe(1_000);
  });
});
