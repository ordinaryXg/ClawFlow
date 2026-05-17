/**
 * Skill Agent：系统级子 Agent，由 ensureSystemAgentsInitialized 统一初始化。
 */

export { buildDefaultSkillAgentSlot } from './skill-agent-defaults';
export { ensureSystemAgentsInitialized, refreshSystemSkillAgentForWorkspace } from '../system-agents/system-agent-roster-bootstrap';

/** @deprecated 使用 ensureSystemAgentsInitialized */
export async function ensureSkillAgentSlotForWorkspace(workspaceRoot: string): Promise<void> {
  const { refreshSystemSkillAgentForWorkspace } = await import('../system-agents/system-agent-roster-bootstrap');
  await refreshSystemSkillAgentForWorkspace(workspaceRoot);
}
