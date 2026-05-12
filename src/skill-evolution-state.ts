/**
 * 主对话轮次计数（用于每 N 轮触发 Skill 进化审核）。存于 `.agent/.clawflow/skill-evolution-state.v1.json`。
 */

import * as fs from 'fs';
import * as path from 'path';
import { clawflowDir } from './workspace-service';

const FILE_VERSION = 1 as const;

type Shape = { version: typeof FILE_VERSION; userTurnsSinceAudit: number; lastAuditAt?: number };

function statePath(workspaceRoot: string): string {
  return path.join(clawflowDir(workspaceRoot), 'skill-evolution-state.v1.json');
}

export async function readSkillEvolutionState(workspaceRoot: string): Promise<Shape> {
  const fp = statePath(workspaceRoot);
  try {
    const buf = await fs.promises.readFile(fp, 'utf-8');
    const p = JSON.parse(buf) as unknown;
    if (p && typeof p === 'object') {
      const o = p as Record<string, unknown>;
      const n = Number(o.userTurnsSinceAudit);
      const last = typeof o.lastAuditAt === 'number' ? o.lastAuditAt : undefined;
      if (Number.isFinite(n) && n >= 0) {
        return { version: FILE_VERSION, userTurnsSinceAudit: Math.floor(n), lastAuditAt: last };
      }
    }
  } catch {
    /* missing */
  }
  return { version: FILE_VERSION, userTurnsSinceAudit: 0 };
}

export async function writeSkillEvolutionState(workspaceRoot: string, next: Shape): Promise<void> {
  const root = path.resolve(workspaceRoot);
  const dir = clawflowDir(root);
  await fs.promises.mkdir(dir, { recursive: true });
  const body: Shape = {
    version: FILE_VERSION,
    userTurnsSinceAudit: Math.max(0, Math.floor(next.userTurnsSinceAudit)),
    ...(typeof next.lastAuditAt === 'number' ? { lastAuditAt: next.lastAuditAt } : {}),
  };
  await fs.promises.writeFile(statePath(root), JSON.stringify(body, null, 2), 'utf-8');
}

export async function incrementMainTurnsSinceSkillAudit(workspaceRoot: string): Promise<number> {
  const cur = await readSkillEvolutionState(workspaceRoot);
  const next = { ...cur, userTurnsSinceAudit: cur.userTurnsSinceAudit + 1 };
  await writeSkillEvolutionState(workspaceRoot, next);
  return next.userTurnsSinceAudit;
}

export async function resetSkillAuditTurnCounter(workspaceRoot: string): Promise<void> {
  const cur = await readSkillEvolutionState(workspaceRoot);
  await writeSkillEvolutionState(workspaceRoot, {
    ...cur,
    userTurnsSinceAudit: 0,
    lastAuditAt: Date.now(),
  });
}
