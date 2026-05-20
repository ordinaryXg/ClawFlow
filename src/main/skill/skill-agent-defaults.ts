import type { SubAgentSlot } from '../../shared/sub-agent-types';
import { SKILL_AGENT_SLOT_ID } from '../../shared/skill-agent-constants';

const DEFAULT_SKILL_AGENT: Omit<SubAgentSlot, 'status'> & { status: SubAgentSlot['status'] } = {
  id: SKILL_AGENT_SLOT_ID,
  label: 'Deduce Evolution',
  behavior:
    '你是工作区推演进化 Agent：按管线阶段依次整理 Hermes 记忆索引、维护 `.agent/.skills` 技能树、扩写 `.agent/.roleAgent` 角色文档；小步可回滚，不替代主会话日常问答。',
  roleTemplateId: 'deduce-evolution',
  status: 'running',
  delegatable: false,
};

export function buildDefaultSkillAgentSlot(): SubAgentSlot {
  return { ...DEFAULT_SKILL_AGENT };
}
