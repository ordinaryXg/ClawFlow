/**
 * 主对话「手动与通讯端」轮次累计 + 进化调度状态 + 智能经验。
 * 存于 `.agent/.evolution/skill-evolution-state.v1.json`。
 */

import * as fs from 'fs';
import * as path from 'path';
import { evolutionStateStorePath, workspaceEvolutionRootAbs } from '../workspace/workspace-evolution-layout';
import { INTELLIGENCE_XP_PER_SUCCESSFUL_EVOLUTION } from '../../shared/intelligence-profile';

const FILE_VERSION = 1 as const;

export type SkillEvolutionPersistedState = {
  version: typeof FILE_VERSION;
  /** 累计：用户手动或通讯端发起、且本轮已落盘 assistant 的完整问答次数（工作区内单调递增） */
  totalUserManualRounds: number;
  /** 智能经验（每次有效进化 +100） */
  intelligenceXp: number;
  /** 上次成功进化完成时的 totalUserManualRounds（用于摘录「自上次进化后」对话） */
  lastEvolutionTotalRounds?: number;
  lastEvolutionAtMs?: number;
};

function statePath(workspaceRoot: string): string {
  return evolutionStateStorePath(workspaceRoot);
}

function normalizeState(raw: unknown): SkillEvolutionPersistedState {
  const base: SkillEvolutionPersistedState = {
    version: FILE_VERSION,
    totalUserManualRounds: 0,
    intelligenceXp: 0,
  };
  if (!raw || typeof raw !== 'object') return base;
  const o = raw as Record<string, unknown>;
  const total = Number(o.totalUserManualRounds);
  const xp = Number(o.intelligenceXp);
  const lastR = o.lastEvolutionTotalRounds;
  const lastMs = o.lastEvolutionAtMs;
  return {
    ...base,
    totalUserManualRounds: Number.isFinite(total) && total >= 0 ? Math.floor(total) : 0,
    intelligenceXp: Number.isFinite(xp) && xp >= 0 ? Math.floor(xp) : 0,
    ...(Number.isFinite(lastR as number) && (lastR as number) >= 0
      ? { lastEvolutionTotalRounds: Math.floor(lastR as number) }
      : {}),
    ...(typeof lastMs === 'number' && Number.isFinite(lastMs) ? { lastEvolutionAtMs: lastMs } : {}),
  };
}

async function readStateFile(fp: string): Promise<SkillEvolutionPersistedState | null> {
  try {
    const buf = await fs.promises.readFile(fp, 'utf-8');
    return normalizeState(JSON.parse(buf) as unknown);
  } catch {
    return null;
  }
}

export async function readSkillEvolutionState(workspaceRoot: string): Promise<SkillEvolutionPersistedState> {
  const primary = await readStateFile(statePath(path.resolve(workspaceRoot)));
  return primary ?? normalizeState(null);
}

export async function writeSkillEvolutionState(workspaceRoot: string, next: SkillEvolutionPersistedState): Promise<void> {
  const root = path.resolve(workspaceRoot);
  await fs.promises.mkdir(workspaceEvolutionRootAbs(root), { recursive: true });
  const body: SkillEvolutionPersistedState = {
    version: FILE_VERSION,
    totalUserManualRounds: Math.max(0, Math.floor(next.totalUserManualRounds)),
    intelligenceXp: Math.max(0, Math.floor(next.intelligenceXp)),
    ...(typeof next.lastEvolutionTotalRounds === 'number'
      ? { lastEvolutionTotalRounds: Math.max(0, Math.floor(next.lastEvolutionTotalRounds)) }
      : {}),
    ...(typeof next.lastEvolutionAtMs === 'number' ? { lastEvolutionAtMs: next.lastEvolutionAtMs } : {}),
  };
  await fs.promises.writeFile(statePath(root), JSON.stringify(body, null, 2), 'utf-8');
}

export async function applySuccessfulEvolutionRewards(workspaceRoot: string, snapshotTotalRounds: number): Promise<void> {
  const cur = await readSkillEvolutionState(workspaceRoot);
  await writeSkillEvolutionState(workspaceRoot, {
    ...cur,
    intelligenceXp: cur.intelligenceXp + INTELLIGENCE_XP_PER_SUCCESSFUL_EVOLUTION,
    lastEvolutionTotalRounds: snapshotTotalRounds,
    lastEvolutionAtMs: Date.now(),
  });
}
