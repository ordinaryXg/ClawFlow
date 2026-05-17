import type { InteractionMode } from './providers/types';

/** 复杂度分类字母（后续可扩展） */
export type ConversationModeCategory = 'a' | 'b' | 'c' | 'd' | 'e';

export type ConversationModeClassification = {
  category: ConversationModeCategory;
  /** 展示用短标签 */
  categoryLabel: string;
  mode: InteractionMode;
  summary: string;
  /** 是否由启发式回退（非模型 JSON） */
  fallback?: boolean;
};

export const CONVERSATION_MODE_CATEGORY_LABELS: Record<ConversationModeCategory, string> = {
  a: 'M1 闲谈',
  b: 'M2 即办',
  c: 'M3 推演',
  d: 'M4 规划',
  e: 'M5 审视',
};

export function buildConversationModeClassifierUserMessage(userText: string): string {
  const body = String(userText ?? '').trim();
  return `【待分类的用户消息】\n${body}\n\n请输出 JSON。`;
}

export function mapCategoryToInteractionMode(category: ConversationModeCategory): InteractionMode {
  switch (category) {
    case 'a':
      return 'ask';
    case 'b':
    case 'c':
      return 'plan';
    case 'd':
    case 'e':
      return 'multitask';
    default:
      return 'ask';
  }
}

function normalizeCategory(raw: unknown): ConversationModeCategory | null {
  const s = String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/^category[\s:=]*/i, '');
  if (s === 'a' || s === 'b' || s === 'c' || s === 'd' || s === 'e') return s;
  const m = s.match(/\b([a-e])\b/);
  return m ? (m[1] as ConversationModeCategory) : null;
}

export function parseClassificationJson(raw: string): { category: ConversationModeCategory; summary: string } | null {
  const text = String(raw ?? '').trim();
  if (!text) return null;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced?.[1] ?? text).trim();
  try {
    const j = JSON.parse(candidate) as { category?: unknown; summary?: unknown };
    const category = normalizeCategory(j?.category);
    if (!category) return null;
    const summary = String(j?.summary ?? '').trim() || CONVERSATION_MODE_CATEGORY_LABELS[category];
    return { category, summary };
  } catch {
    const category = normalizeCategory(candidate);
    if (!category) return null;
    return { category, summary: CONVERSATION_MODE_CATEGORY_LABELS[category] };
  }
}

export function classificationFromParsed(parsed: {
  category: ConversationModeCategory;
  summary: string;
}): ConversationModeClassification {
  return {
    category: parsed.category,
    categoryLabel: CONVERSATION_MODE_CATEGORY_LABELS[parsed.category],
    mode: mapCategoryToInteractionMode(parsed.category),
    summary: parsed.summary,
  };
}

/** 无模型或解析失败时的启发式回退 */
export function heuristicConversationModeClassification(userText: string): ConversationModeClassification {
  const t = String(userText ?? '').trim();
  const len = t.length;
  const hasActionSignals =
    /运行|执行|搜索|查找|改|修改|重构|提交|commit|git\s|rg\s|diff|log|grep|build|test|创建|删除|写入|部署/i.test(t);
  const hasPlanningSignals =
    /步骤|计划|方案|对比|权衡|取舍|设计|架构|roadmap|plan|tradeoff|compare|pros|cons|多步|分阶段/i.test(t);
  const hasDeepThink =
    /复杂|深入|详细分析|权衡|架构设计|系统设计|为什么.*如何|根因/i.test(t);

  let category: ConversationModeCategory = 'a';
  if (hasActionSignals && !hasPlanningSignals && len < 180) category = 'c';
  else if (hasPlanningSignals && hasActionSignals) category = 'e';
  else if (hasDeepThink || len > 280) category = 'd';
  else if (hasPlanningSignals || len > 120) category = 'b';
  else if (hasActionSignals) category = 'c';
  else if (len <= 80) category = 'a';

  return {
    ...classificationFromParsed({
      category,
      summary: '启发式回退分类',
    }),
    fallback: true,
  };
}

export function parseClassificationResponse(raw: string): ConversationModeClassification | null {
  const parsed = parseClassificationJson(raw);
  if (!parsed) return null;
  return classificationFromParsed(parsed);
}
