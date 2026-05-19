/**
 * Skill Agent：系统级子 Agent，由 ensureSystemAgentsInitialized 统一初始化。
 */

export { buildDefaultSkillAgentSlot } from './skill-agent-defaults';
export { ensureSystemAgentsInitialized, refreshSystemSkillAgentForWorkspace } from '../system-agents/system-agent-roster-bootstrap';
