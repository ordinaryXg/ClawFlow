import {
  needsExpectationPlanning,
  parseExpectationPlanResponse,
  formatExpectationPlanMarkdown,
} from './expectation-plan';

describe('expectation-plan', () => {
  it('needsExpectationPlanning only for M3/M4', () => {
    expect(needsExpectationPlanning('c')).toBe(true);
    expect(needsExpectationPlanning('d')).toBe(true);
    expect(needsExpectationPlanning('a')).toBe(false);
    expect(needsExpectationPlanning('b')).toBe(false);
    expect(needsExpectationPlanning('e')).toBe(false);
  });

  it('parses fenced JSON plan', () => {
    const raw = '```json\n{"goal_summary":"目标","assumptions":[],"needs_external_research":false,"external_research_rationale":"","suggested_research_queries":[],"steps":[{"id":"1","title":"读代码","detail":"扫描模块","depends_on":[]}],"safety_boundaries":["不删库"],"acceptance_criteria":["测试通过"],"risks":[]}\n```';
    const { plan } = parseExpectationPlanResponse(raw);
    expect(plan?.goal_summary).toBe('目标');
    expect(plan?.steps[0]?.title).toBe('读代码');
    expect(formatExpectationPlanMarkdown(plan!)).toContain('读代码');
  });
});
