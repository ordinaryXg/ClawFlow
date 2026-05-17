import type { SubAgentRoleTemplateId } from './sub-agent-types';
import {
  COGNITIVE_ALLOCATION_AGENT_SLOT_ID,
  EXPECTATION_PLANNING_AGENT_SLOT_ID,
  isSystemSubAgentSlotId,
  SKILL_AGENT_SLOT_ID,
} from './system-agent-constants';

export {
  COGNITIVE_ALLOCATION_AGENT_SLOT_ID,
  EXPECTATION_PLANNING_AGENT_SLOT_ID,
  isSystemSubAgentSlotId,
  SKILL_AGENT_SLOT_ID,
};

/** 固定委派槽位（主 Agent 可 delegate）；顺序即 UI / 持久化顺序 */
export const STANDARD_SUB_AGENT_SLOT_IDS = [
  'cf-sub-program',
  'cf-sub-creative',
  'cf-sub-data',
  'cf-sub-assistant',
] as const;

export type StandardSubAgentSlotId = (typeof STANDARD_SUB_AGENT_SLOT_IDS)[number];

export type SubAgentRosterDef = {
  id: StandardSubAgentSlotId;
  roleTemplateId: SubAgentRoleTemplateId;
  defaultLabel: string;
  defaultBehavior: string;
};

export const STANDARD_SUB_AGENT_ROSTER: readonly SubAgentRosterDef[] = [
  {
    id: 'cf-sub-program',
    roleTemplateId: 'program',
    defaultLabel: '程序 Agent',
    defaultBehavior:
      '偏交付与可验证：可运行命令、读改代码、跑测试与脚本；输出尽量带复现步骤与验收标准。',
  },
  {
    id: 'cf-sub-creative',
    roleTemplateId: 'creative',
    defaultLabel: '创意 Agent',
    defaultBehavior: '偏方案与表达：文案、脚本、信息架构与多方案对比；避免未经验证的实现细节冒充事实。',
  },
  {
    id: 'cf-sub-data',
    roleTemplateId: 'data',
    defaultLabel: '数据 Agent',
    defaultBehavior: '偏可复现分析：假设、数据来源、计算口径与局限；表格/结论需可追溯到输入与步骤。',
  },
  {
    id: 'cf-sub-assistant',
    roleTemplateId: 'assistant',
    defaultLabel: '助理 Agent',
    defaultBehavior: '偏推进与拆解：把目标拆成可执行步骤、对齐约束与风险；需要工具时再最小化调用。',
  },
] as const;

const STANDARD_ID_SET = new Set<string>(STANDARD_SUB_AGENT_SLOT_IDS);

/** 工作区 `.subagent/` 下仅创建委派槽位的缓存子目录 */
export const WORKSPACE_SUBAGENT_SLOT_IDS_ORDERED: readonly string[] = [...STANDARD_SUB_AGENT_SLOT_IDS];

/** @deprecated 使用 WORKSPACE_SUBAGENT_SLOT_IDS_ORDERED */
export const ALL_SUBAGENT_SLOT_IDS_ORDERED = WORKSPACE_SUBAGENT_SLOT_IDS_ORDERED;

/** 不可从工作区名册删除的槽位（仅 4 个标准委派槽；系统 Agent 不在工作区名册） */
export function isReservedSubAgentSlotId(id: string): boolean {
  const s = String(id || '').trim();
  if (isSystemSubAgentSlotId(s)) return false;
  return STANDARD_ID_SET.has(s);
}

export function isStandardSubAgentSlotId(id: string): boolean {
  return STANDARD_ID_SET.has(String(id || '').trim());
}
