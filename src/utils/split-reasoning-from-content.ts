/**
 * 部分模型把思考与回答塞进一条 `content` JSON；与原生 `reasoning_content` 互补。
 * 仅在能识别出「思考类字段」时才拆分，避免误伤普通 JSON 回答。
 */

const REASON_KEYS = [
  'reasoning_content',
  'reasoning',
  'thinking',
  'thought',
  'analysis',
  'chain_of_thought',
  'cot',
  'internal_monologue',
  'deliberation',
  'reflection',
  '思考',
  '思考过程',
  '推理',
];

const ANSWER_KEYS = [
  'answer',
  'response',
  'reply',
  'final',
  'message',
  'output',
  'content',
  'result',
  'summary',
  '总结',
  '回答',
];

function pickJoinedStrings(o: Record<string, unknown>, keys: readonly string[]): string {
  const parts: string[] = [];
  for (const k of keys) {
    if (!(k in o)) continue;
    const v = o[k];
    if (typeof v === 'string' && v.trim()) parts.push(v.trim());
  }
  return parts.join('\n\n');
}

function pickFirstAnswerString(o: Record<string, unknown>): string {
  for (const k of ANSWER_KEYS) {
    const v = o[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return '';
}

/**
 * @returns contentOut 为展示用正文；reasoning 为从 JSON 抽出的思考（不含 API 侧 reasoning_content）
 */
export function tryExtractReasoningFromStructuredContent(raw: string | null | undefined): {
  content: string;
  reasoning?: string;
} {
  const original = String(raw ?? '');
  const t = original.trim();
  if (!t) return { content: original };

  const looksJsonObject = t.startsWith('{') && t.endsWith('}');
  if (!looksJsonObject) return { content: original };

  let parsed: unknown;
  try {
    parsed = JSON.parse(t);
  } catch {
    return { content: original };
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { content: original };
  }

  const o = parsed as Record<string, unknown>;
  const reasoning = pickJoinedStrings(o, REASON_KEYS);
  if (!reasoning) return { content: original };

  const answer = pickFirstAnswerString(o);
  if (answer) {
    return { content: answer, reasoning };
  }

  return { content: '', reasoning };
}

/** 合并 API reasoning 字段与 content JSON 内抽出的思考 */
export function mergeCompletionReasoning(
  rawContent: string | null | undefined,
  apiReasoning: string | null | undefined
): { displayContent: string; reasoningCombined: string } {
  const extracted = tryExtractReasoningFromStructuredContent(rawContent);
  const fromApi = typeof apiReasoning === 'string' ? apiReasoning.trim() : '';
  const fromJson = extracted.reasoning?.trim() ?? '';
  const reasoningCombined = [fromApi, fromJson].filter(Boolean).join('\n\n—\n\n');
  return {
    displayContent: extracted.content,
    reasoningCombined,
  };
}
