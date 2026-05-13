import type { SubAgentSlot } from '../../shared/sub-agent-types';
import { SKILL_AGENT_SLOT_ID } from '../../shared/skill-agent-constants';

const DEFAULT_SKILL_AGENT: Omit<SubAgentSlot, 'status'> & { status: SubAgentSlot['status'] } = {
  id: SKILL_AGENT_SLOT_ID,
  label: 'Skill Agent',
  behavior:
    '你是工作区 Hermes 技能的专职维护者：周期性审查 `.agent/.skills` 下的 SKILL.md 与 references，结合近期主对话主题，提出并落实技能的创建、合并、更新与轻量「进化」（保持可回滚、变更克制）。不要承担主 Agent 的日常任务调度。',
  roleTemplateId: 'skills',
  status: 'running',
  delegatable: false,
};

export function buildDefaultSkillAgentSlot(): SubAgentSlot {
  return { ...DEFAULT_SKILL_AGENT };
}
