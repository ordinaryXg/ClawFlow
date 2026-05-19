/**
 * 进化运行记录（含各阶段 diff），存于 `.agent/.clawflow/evolution-runs.v1.json`。
 */

import * as fs from 'fs';
import * as path from 'path';
import { clawflowDir } from '../workspace/workspace-service';
import { broadcastToWorkspaceWindows } from '../broadcast/workspace-window-broadcast';
import type { EvolutionAspectKey } from './skill-evolution-scheduler';
import type { EvolutionDiffEntry } from './skill-evolution-snapshot';
import { restoreEvolutionBackup } from './skill-evolution-snapshot';

const FILE_VERSION = 1 as const;
const MAX_RUNS = 48;

export type EvolutionRunPhaseRecord = {
  aspect: EvolutionAspectKey;
  agentOk: boolean;
  agentError?: string;
  messageExcerpt?: string;
  diff: EvolutionDiffEntry[];
};

export type EvolutionRunRecord = {
  runId: string;
  at: number;
  ok: boolean;
  manual?: boolean;
  triggerTotal?: number;
  spacing?: number;
  failureReason?: string;
  phases: EvolutionRunPhaseRecord[];
  aggregateDiff: EvolutionDiffEntry[];
  reverted?: boolean;
  revertedAt?: number;
};

type StoreFile = { version: typeof FILE_VERSION; runs: EvolutionRunRecord[] };

function storePath(workspaceRoot: string): string {
  return path.join(clawflowDir(workspaceRoot), 'evolution-runs.v1.json');
}

async function readStore(workspaceRoot: string): Promise<StoreFile> {
  try {
    const raw = await fs.promises.readFile(storePath(workspaceRoot), 'utf8');
    const j = JSON.parse(raw) as StoreFile;
    if (!j || typeof j !== 'object' || !Array.isArray(j.runs)) {
      return { version: FILE_VERSION, runs: [] };
    }
    return { version: FILE_VERSION, runs: j.runs.filter((r) => r && typeof r.runId === 'string') };
  } catch {
    return { version: FILE_VERSION, runs: [] };
  }
}

async function writeStore(workspaceRoot: string, data: StoreFile): Promise<void> {
  const p = storePath(workspaceRoot);
  await fs.promises.mkdir(path.dirname(p), { recursive: true });
  await fs.promises.writeFile(p, JSON.stringify(data, null, 2), 'utf8');
}

export function broadcastEvolutionRunsUpdated(workspaceRoot: string): void {
  broadcastToWorkspaceWindows(workspaceRoot, 'workspace:evolutionRunsUpdated');
}

export async function appendEvolutionRun(workspaceRoot: string, run: EvolutionRunRecord): Promise<void> {
  const store = await readStore(workspaceRoot);
  store.runs.unshift(run);
  if (store.runs.length > MAX_RUNS) store.runs = store.runs.slice(0, MAX_RUNS);
  await writeStore(workspaceRoot, store);
  broadcastEvolutionRunsUpdated(workspaceRoot);
}

export async function listEvolutionRuns(workspaceRoot: string, limit = 24): Promise<EvolutionRunRecord[]> {
  const store = await readStore(workspaceRoot);
  return store.runs.slice(0, Math.max(1, Math.min(limit, MAX_RUNS)));
}

export async function getEvolutionRun(
  workspaceRoot: string,
  runId: string
): Promise<EvolutionRunRecord | null> {
  const id = String(runId).trim();
  if (!id) return null;
  const store = await readStore(workspaceRoot);
  return store.runs.find((r) => r.runId === id) ?? null;
}

export async function markEvolutionRunReverted(workspaceRoot: string, runId: string): Promise<boolean> {
  const store = await readStore(workspaceRoot);
  const idx = store.runs.findIndex((r) => r.runId === runId);
  if (idx < 0) return false;
  store.runs[idx] = { ...store.runs[idx], reverted: true, revertedAt: Date.now() };
  await writeStore(workspaceRoot, store);
  broadcastEvolutionRunsUpdated(workspaceRoot);
  return true;
}

export async function revertEvolutionRun(
  workspaceRoot: string,
  runId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const id = String(runId).trim();
  if (!id) return { ok: false, error: 'missing_run_id' };
  const run = await getEvolutionRun(workspaceRoot, id);
  if (!run) return { ok: false, error: 'run_not_found' };
  if (run.reverted) return { ok: false, error: 'already_reverted' };
  if (!run.ok) return { ok: false, error: 'run_not_successful' };
  try {
    await restoreEvolutionBackup(workspaceRoot, id);
    await markEvolutionRunReverted(workspaceRoot, id);
    return { ok: true };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}
