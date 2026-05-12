/** 智能经验：等级上限 100，曲线可后续再调 */

export const INTELLIGENCE_XP_PER_SUCCESSFUL_EVOLUTION = 100;

/** 累计 XP → 展示等级（1–100） */
export function intelligenceLevelFromXp(xp: number): number {
  const x = Math.max(0, Math.floor(Number(xp) || 0));
  if (x <= 0) return 1;
  // sqrt 曲线：前期升级快，后期趋缓；约 50000 XP 达 100 级
  const lv = 1 + Math.floor(Math.sqrt(x / 5));
  return Math.min(100, Math.max(1, lv));
}

/** 当前等级内进度 0–1（用于条或提示） */
export function intelligenceLevelProgress(xp: number): { level: number; progress01: number; xpIntoLevel: number; xpForNext: number } {
  const x = Math.max(0, Math.floor(Number(xp) || 0));
  const level = intelligenceLevelFromXp(xp);
  if (level >= 100) {
    return { level: 100, progress01: 1, xpIntoLevel: 0, xpForNext: 0 };
  }
  const xpMin = 5 * (level - 1) * (level - 1);
  const xpMax = 5 * level * level;
  const span = Math.max(1, xpMax - xpMin);
  const into = Math.max(0, x - xpMin);
  return {
    level,
    progress01: Math.min(1, into / span),
    xpIntoLevel: into,
    xpForNext: span - into,
  };
}
