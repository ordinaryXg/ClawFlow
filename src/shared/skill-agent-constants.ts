/** 与主进程 / 渲染进程共享的 Skill Agent 常量 */

export { SKILL_AGENT_SLOT_ID } from './system-agent-constants';

/** 不落盘主会话：Skill 审计 run 的虚拟会话 id（须不在 conversations 列表中） */
export const SKILL_AUDIT_EPHEMERAL_CONVERSATION_ID = '__cf_skill_audit__';

/**
 * 工作区内「用户手动或通讯端」完整问答累计次数 total 对应的进化触发间隔（每满 interval 轮触发一次）。
 * - total < 100：每 10 轮
 * - 100 ≤ total < 1000：每 floor(total/10) 轮（十分之一量级）
 * - 1000 ≤ total < 10000：每 100 轮
 * - 10000 ≤ total < 100000：每 1000 轮
 * - total ≥ 100000：每 10000 轮
 */
export function computeSkillEvolutionSpacing(totalUserManualRounds: number): number {
  const t = Math.max(0, Math.floor(totalUserManualRounds));
  if (t < 100) return 10;
  if (t < 1000) return Math.max(10, Math.floor(t / 10));
  if (t < 10000) return 100;
  if (t < 100000) return 1000;
  return 10000;
}

/** @deprecated 已由 computeSkillEvolutionSpacing + totalUserManualRounds 取模触发替代 */
export const SKILL_EVOLUTION_INTERVAL_MAIN_TURNS = 10;
