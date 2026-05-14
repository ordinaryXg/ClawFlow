export type ContextEstimateMessage = {
  content: string;
  reasoningContent?: string;
  meta?: Record<string, unknown>;
};

/** 粗略 token 估计（无 tiktoken 时的实用近似） */
export function estimateTokensFromText(s: string | undefined | null): number {
  const t = String(s ?? '');
  if (!t) return 0;
  return Math.max(1, Math.ceil(t.length / 4));
}

/** 常见模型上下文上限（token 级近似；未知模型取保守值）。与厂商实际窗口可能有偏差，仅用于 UI 饱和度与溢出参考。 */
export function resolveContextTokenLimit(modelId: string | null | undefined): number {
  const id = String(modelId ?? '').trim();
  if (!id) return 128_000;
  const lower = id.toLowerCase();
  // DeepSeek V4：官方 API 写明 Pro / Flash 为 1M context（须在泛化 `deepseek` 之前匹配）
  if (lower.includes('deepseek-v4')) return 1_000_000;
  if (lower.includes('deepseek')) return 64_000;
  if (lower.includes('gpt-4o-mini')) return 128_000;
  if (lower.includes('gpt-4o')) return 128_000;
  if (lower.includes('gpt-3.5')) return 16_385;
  if (lower.includes('claude-3-5') || lower.includes('claude-3-5-sonnet')) return 200_000;
  if (lower.includes('claude')) return 200_000;
  return 128_000;
}

export function estimateMessagesContextTokens(messages: readonly ContextEstimateMessage[]): number {
  let n = 0;
  for (const m of messages) {
    n += estimateTokensFromText(m.content);
    n += estimateTokensFromText(m.reasoningContent);
    if (m.meta && typeof m.meta === 'object') {
      try {
        n += estimateTokensFromText(JSON.stringify(m.meta));
      } catch {
        /* ignore */
      }
    }
  }
  /** 系统提示与工具 schema 占位 */
  n += 4000;
  return n;
}

export function computeContextSaturation(messages: readonly ContextEstimateMessage[], modelId: string | null | undefined): number {
  const limit = resolveContextTokenLimit(modelId);
  const used = estimateMessagesContextTokens(messages);
  if (limit <= 0) return 0;
  return Math.min(1, used / limit);
}
