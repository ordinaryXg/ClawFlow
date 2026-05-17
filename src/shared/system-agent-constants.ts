/** 系统级子 Agent（应用缓存，不随工作区 `.subagent/` 落盘） */

export const SKILL_AGENT_SLOT_ID = 'cf-skill-agent';

/** 认知分配：发送主对话前对用户消息做 M1–M5 / a–e 分类 */
export const COGNITIVE_ALLOCATION_AGENT_SLOT_ID = 'cf-cognitive-allocation';

/** 预期规划：复杂任务的整体规划（步骤、边界、验收、外部信息判断） */
export const EXPECTATION_PLANNING_AGENT_SLOT_ID = 'cf-expectation-planning';

export const SYSTEM_SUB_AGENT_SLOT_IDS_ORDERED = [
  SKILL_AGENT_SLOT_ID,
  COGNITIVE_ALLOCATION_AGENT_SLOT_ID,
  EXPECTATION_PLANNING_AGENT_SLOT_ID,
] as const;

export type SystemSubAgentSlotId = (typeof SYSTEM_SUB_AGENT_SLOT_IDS_ORDERED)[number];

const SYSTEM_ID_SET = new Set<string>(SYSTEM_SUB_AGENT_SLOT_IDS_ORDERED);

export function isSystemSubAgentSlotId(id: string): boolean {
  return SYSTEM_ID_SET.has(String(id ?? '').trim());
}
