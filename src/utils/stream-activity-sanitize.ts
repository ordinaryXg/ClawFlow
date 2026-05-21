/** 流式对话区：解析/过滤工具生命周期标记与未完成 JSON，避免先闪 raw JSON 再出卡片。 */

const TOOL_MARKER_RE = /\[tool:(start|done|fail)\]\s*([^\n\r]*)/g;

export type StreamToolHint = {
  name: string;
  phase: 'start' | 'done' | 'fail';
};

export type SanitizedStreamActivity = {
  /** 可展示的正文（已去掉工具 JSON 与未完成片段） */
  text: string;
  /** 从原始流解析出的工具状态（供 UI 展示占位） */
  toolHints: StreamToolHint[];
};

function extractToolHints(raw: string): StreamToolHint[] {
  const hints: StreamToolHint[] = [];
  for (const m of raw.matchAll(TOOL_MARKER_RE)) {
    const phase = m[1] as StreamToolHint['phase'];
    const name = String(m[2] ?? '').trim();
    if (name) hints.push({ name, phase });
  }
  return hints;
}

function stripToolLifecycleBlocks(raw: string): string {
  let s = raw;
  // 去掉 [tool:*] 行及其后紧跟的一整段 JSON（工具输出摘要）
  s = s.replace(/\[tool:(?:start|done|fail)\][^\n\r]*\r?\n(?:\s*\{[\s\S]*?\}\s*)?/g, '');
  s = s.replace(/\[tool:(?:start|done|fail)\][^\n\r]*/g, '');
  return s;
}

/** 去掉末尾未闭合的 `{` / `[` JSON 片段（流式参数常见）。 */
export function stripTrailingIncompleteJson(text: string): string {
  const s = String(text ?? '');
  if (!s.trim()) return s;

  let inString = false;
  let escape = false;
  let depth = 0;
  let jsonStart = -1;

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inString) {
      if (escape) {
        escape = false;
        continue;
      }
      if (ch === '\\') {
        escape = true;
        continue;
      }
      if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === '{' || ch === '[') {
      if (depth === 0) jsonStart = i;
      depth++;
      continue;
    }
    if (ch === '}' || ch === ']') {
      if (depth > 0) depth--;
      if (depth === 0) jsonStart = -1;
    }
  }

  if (depth > 0 && jsonStart >= 0) {
    return s.slice(0, jsonStart).replace(/\s+$/, '');
  }
  return s;
}

function looksLikeToolArgumentsJson(text: string): boolean {
  const t = text.trim();
  if (!t.startsWith('{') && !t.startsWith('[')) return false;
  // 模型流式 tool arguments 或工具输出常见字段
  return (
    /"domain"\s*:/.test(t) ||
    /"args"\s*:/.test(t) ||
    /"relativePath"\s*:/.test(t) ||
    /"command"\s*:/.test(t) ||
    /"tool_call_id"\s*:/.test(t) ||
    /"function"\s*:/.test(t) ||
    /"arguments"\s*:/.test(t)
  );
}

/**
 * 将 ReasoningStreamDemux 产出的 activity 转为可安全展示的文本。
 * 工具卡片由会话同步提供；此处仅保留非工具类正文，并抑制 JSON 闪烁。
 */
export function sanitizeStreamActivityForDisplay(raw: string): SanitizedStreamActivity {
  const toolHints = extractToolHints(raw);
  let text = stripToolLifecycleBlocks(raw);
  text = stripTrailingIncompleteJson(text);

  const trimmed = text.trim();
  if (!trimmed) {
    return { text: '', toolHints };
  }

  // 整段仍是工具 JSON（流式 arguments 尚未闭合时被 strip 掉则 trimmed 为空；闭合后可能整段是 JSON）
  if (looksLikeToolArgumentsJson(trimmed)) {
    try {
      JSON.parse(trimmed);
      return { text: '', toolHints };
    } catch {
      // 未完成 JSON：不展示
      return { text: '', toolHints };
    }
  }

  return { text: trimmed, toolHints };
}

/** 是否有进行中的工具（已 start 且未见同 name 的 done/fail） */
export function pickRunningToolHints(hints: StreamToolHint[]): StreamToolHint[] {
  const lastByName = new Map<string, StreamToolHint>();
  for (const h of hints) {
    lastByName.set(h.name, h);
  }
  return [...lastByName.values()].filter((h) => h.phase === 'start');
}
