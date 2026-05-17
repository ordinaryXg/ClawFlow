/** 预期规划 Agent JSON 契约（与 expectation-planning/AGENTS.md 一致） */

export type ExpectationPlanStep = {
  id: string;
  title: string;
  detail: string;
  depends_on: string[];
};

export type ExpectationPlan = {
  goal_summary: string;
  assumptions: string[];
  needs_external_research: boolean;
  external_research_rationale: string;
  suggested_research_queries: string[];
  steps: ExpectationPlanStep[];
  safety_boundaries: string[];
  acceptance_criteria: string[];
  risks: string[];
};

export type ExpectationPlanParseResult = {
  plan: ExpectationPlan | null;
  raw: string;
};

export function needsExpectationPlanning(category: string): boolean {
  const c = String(category ?? '')
    .trim()
    .toLowerCase();
  return c === 'c' || c === 'd';
}

export function parseExpectationPlanResponse(raw: string): ExpectationPlanParseResult {
  const text = String(raw ?? '').trim();
  if (!text) return { plan: null, raw: text };
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced?.[1] ?? text).trim();
  try {
    const j = JSON.parse(candidate) as Partial<ExpectationPlan>;
    if (!j || typeof j !== 'object') return { plan: null, raw: text };
    const plan: ExpectationPlan = {
      goal_summary: String(j.goal_summary ?? '').trim(),
      assumptions: Array.isArray(j.assumptions) ? j.assumptions.map((x) => String(x)) : [],
      needs_external_research: Boolean(j.needs_external_research),
      external_research_rationale: String(j.external_research_rationale ?? '').trim(),
      suggested_research_queries: Array.isArray(j.suggested_research_queries)
        ? j.suggested_research_queries.map((x) => String(x))
        : [],
      steps: Array.isArray(j.steps)
        ? j.steps.map((s, i) => ({
            id: String((s as ExpectationPlanStep)?.id ?? i + 1),
            title: String((s as ExpectationPlanStep)?.title ?? ''),
            detail: String((s as ExpectationPlanStep)?.detail ?? ''),
            depends_on: Array.isArray((s as ExpectationPlanStep)?.depends_on)
              ? (s as ExpectationPlanStep).depends_on.map((x) => String(x))
              : [],
          }))
        : [],
      safety_boundaries: Array.isArray(j.safety_boundaries) ? j.safety_boundaries.map((x) => String(x)) : [],
      acceptance_criteria: Array.isArray(j.acceptance_criteria)
        ? j.acceptance_criteria.map((x) => String(x))
        : [],
      risks: Array.isArray(j.risks) ? j.risks.map((x) => String(x)) : [],
    };
    if (!plan.goal_summary && !plan.steps.length) return { plan: null, raw: text };
    return { plan, raw: text };
  } catch {
    return { plan: null, raw: text };
  }
}

export function formatExpectationPlanMarkdown(plan: ExpectationPlan): string {
  const lines: string[] = [];
  lines.push(`### ${plan.goal_summary || '（未填写目标）'}`);
  if (plan.assumptions.length) {
    lines.push('', '**假设**', ...plan.assumptions.map((a) => `- ${a}`));
  }
  lines.push(
    '',
    `**外部调研**：${plan.needs_external_research ? '建议' : '暂不需要'}`,
    plan.external_research_rationale ? `> ${plan.external_research_rationale}` : ''
  );
  if (plan.suggested_research_queries.length) {
    lines.push('', '**建议检索**', ...plan.suggested_research_queries.map((q) => `- ${q}`));
  }
  if (plan.steps.length) {
    lines.push('', '**步骤**');
    plan.steps.forEach((s, idx) => {
      const dep = s.depends_on.length ? `（依赖：${s.depends_on.join(', ')}）` : '';
      lines.push(`${idx + 1}. **${s.id}. ${s.title}**${dep}`, s.detail ? `   ${s.detail}` : '');
    });
  }
  if (plan.safety_boundaries.length) {
    lines.push('', '**安全边界**', ...plan.safety_boundaries.map((b) => `- ${b}`));
  }
  if (plan.acceptance_criteria.length) {
    lines.push('', '**验收标准**', ...plan.acceptance_criteria.map((a) => `- ${a}`));
  }
  if (plan.risks.length) {
    lines.push('', '**风险**', ...plan.risks.map((r) => `- ${r}`));
  }
  return lines.filter((l) => l !== undefined).join('\n').trim();
}

/** 注入主 Agent 用户消息前缀（不重复展示给用户原文时可仅用 plan 摘要） */
export function buildExpectationPlanContextForMainAgent(plan: ExpectationPlan | string): string {
  const body =
    typeof plan === 'string' ? plan.trim() : formatExpectationPlanMarkdown(plan);
  return [
    '【系统：预期规划 Agent 产出（M3/M4 前置编排）】',
    '请按下列规划推进任务；勿向用户复述本段全文，除非用户明确要求查看规划。',
    '',
    body,
    '',
    '---',
    '',
    '【用户消息】',
    '',
  ].join('\n');
}

export function buildExpectationPlanningUserMessage(params: {
  userText: string;
  categoryLabel?: string;
  classificationSummary?: string;
}): string {
  const body = String(params.userText ?? '').trim();
  const meta = [
    params.categoryLabel ? `认知等级：${params.categoryLabel}` : '',
    params.classificationSummary ? `分类说明：${params.classificationSummary}` : '',
  ]
    .filter(Boolean)
    .join('\n');
  return [`【待规划的用户任务】`, meta, meta ? '' : '', body, '', '请输出 JSON 规划（见 AGENTS.md 契约）。'].join('\n');
}
