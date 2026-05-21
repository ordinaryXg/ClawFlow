import {
  FEISHU_INVOKE_JSON_MAX_CHARS,
  formatFeishuInvokeToolResult,
  TOOL_RESULT_PERSIST_MAX_CHARS,
  truncateJsonForTool,
  truncateToolResultText,
} from './tool-result-truncate';

describe('tool-result-truncate', () => {
  it('truncateToolResultText passes through small text', () => {
    expect(truncateToolResultText('hello')).toBe('hello');
  });

  it('truncateToolResultText caps long text', () => {
    const long = 'x'.repeat(300_000);
    const out = truncateToolResultText(long, 1000);
    expect(out.length).toBeLessThanOrEqual(1000);
    expect(out).toContain('truncated');
  });

  it('truncateJsonForTool keeps small objects', () => {
    const o = { a: 1 };
    expect(truncateJsonForTool(o, 100)).toEqual(o);
  });

  it('truncateJsonForTool wraps huge objects', () => {
    const huge = { data: 'y'.repeat(FEISHU_INVOKE_JSON_MAX_CHARS + 10_000) };
    const out = truncateJsonForTool(huge, FEISHU_INVOKE_JSON_MAX_CHARS) as Record<string, unknown>;
    expect(out._truncated).toBe(true);
    expect(out._originalChars).toBeGreaterThan(FEISHU_INVOKE_JSON_MAX_CHARS);
  });

  it('formatFeishuInvokeToolResult stays under persist cap', () => {
    const res = formatFeishuInvokeToolResult({
      ok: true,
      exitCode: 0,
      json: { grid: 'z'.repeat(3_000_000) },
      stdout: 'a'.repeat(100_000),
      stderr: '',
    });
    expect(res.length).toBeLessThanOrEqual(TOOL_RESULT_PERSIST_MAX_CHARS);
  });
});
