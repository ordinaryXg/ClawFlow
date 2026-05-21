/** 工具回执持久化 / 进模型上下文的上限（字符，UTF-16 长度近似字节上界） */
export const TOOL_RESULT_PERSIST_MAX_CHARS = 256 * 1024;

/** workspace_feishu_invoke 内 json 字段上限 */
export const FEISHU_INVOKE_JSON_MAX_CHARS = 256 * 1024;

export const FEISHU_INVOKE_STDOUT_MAX_CHARS = 48_000;
export const FEISHU_INVOKE_STDERR_MAX_CHARS = 16_000;

const TRUNCATE_HINT =
  '\n\n… [ClawFlow: tool result truncated; use narrower query or partial read — see feishu.md / lark-cli +fetch --scope, sheets +read --range] …';

export function truncateToolResultText(
  content: string,
  maxChars: number = TOOL_RESULT_PERSIST_MAX_CHARS
): string {
  const s = String(content ?? '');
  if (s.length <= maxChars) return s;
  const suffix = `\n(original ${s.length} chars)`;
  const tail = TRUNCATE_HINT + suffix;
  const keep = Math.max(0, maxChars - tail.length);
  return `${s.slice(0, keep)}${tail}`;
}

/**
 * 超大 JSON 转为带 preview 的截断对象，避免 stringify 后撑爆上下文。
 * 未超限则返回原值。
 */
export function truncateJsonForTool(value: unknown, maxChars: number): unknown {
  if (value === undefined) return undefined;
  let compact: string;
  try {
    compact = JSON.stringify(value);
  } catch {
    return { _truncated: true, _error: 'non_serializable_json' };
  }
  if (compact.length <= maxChars) return value;
  const metaLen = 512;
  const previewKeep = Math.max(0, maxChars - metaLen);
  return {
    _truncated: true,
    _originalChars: compact.length,
    _preview: compact.slice(0, previewKeep),
    _hint:
      'JSON exceeded size limit. Use partial reads: docs +fetch --scope outline|keyword|range; sheets +read/--find --range; base +data-query; avoid api GET .../sheets/query for full grid.',
  };
}

export type FeishuInvokeToolPayload = {
  ok: boolean;
  exitCode: number;
  json?: unknown;
  stdout: string;
  stderr: string;
};

export function formatFeishuInvokeToolResult(res: FeishuInvokeToolPayload): string {
  const body = {
    ok: res.ok,
    exitCode: res.exitCode,
    json: truncateJsonForTool(res.json, FEISHU_INVOKE_JSON_MAX_CHARS),
    stdout: String(res.stdout ?? '').slice(0, FEISHU_INVOKE_STDOUT_MAX_CHARS),
    stderr: String(res.stderr ?? '').slice(0, FEISHU_INVOKE_STDERR_MAX_CHARS),
  };
  const out = JSON.stringify(body);
  return truncateToolResultText(out, TOOL_RESULT_PERSIST_MAX_CHARS);
}
