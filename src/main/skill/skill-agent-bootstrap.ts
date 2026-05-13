/**
 * Skill Agent 与工作区子 Agent 名册同步入口（manifest skills 开关由名册逻辑统一处理）。
 */

import { ensureSubAgentRosterForWorkspace } from '../sub-agent/sub-agent-roster-bootstrap';

export { buildDefaultSkillAgentSlot } from './skill-agent-defaults';

export async function ensureSkillAgentSlotForWorkspace(workspaceRoot: string): Promise<void> {
  await ensureSubAgentRosterForWorkspace(workspaceRoot);
}
