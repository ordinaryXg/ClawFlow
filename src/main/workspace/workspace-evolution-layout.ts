/**
 * 进化管线专用目录：`.agent/.evolution/`（备份、运行记录、调度状态）。
 */
import * as fs from 'fs';
import * as path from 'path';
import { workspaceAgentRootAbs } from './workspace-agent-layout';

export const WORKSPACE_EVOLUTION_REL = '.agent/.evolution';
export const WORKSPACE_EVOLUTION_BACKUPS_REL = '.agent/.evolution/backups';

export const EVOLUTION_RUNS_FILE = 'evolution-runs.v1.json';
export const EVOLUTION_STATE_FILE = 'skill-evolution-state.v1.json';

function resolved(workspaceRoot: string): string {
  return path.resolve(String(workspaceRoot ?? '').trim());
}

export function workspaceEvolutionRootAbs(workspaceRoot: string): string {
  return path.join(workspaceAgentRootAbs(workspaceRoot), '.evolution');
}

export function evolutionBackupsDirAbs(workspaceRoot: string): string {
  return path.join(workspaceEvolutionRootAbs(workspaceRoot), 'backups');
}

export function evolutionRunsStorePath(workspaceRoot: string): string {
  return path.join(workspaceEvolutionRootAbs(workspaceRoot), EVOLUTION_RUNS_FILE);
}

export function evolutionStateStorePath(workspaceRoot: string): string {
  return path.join(workspaceEvolutionRootAbs(workspaceRoot), EVOLUTION_STATE_FILE);
}

/** 确保进化元数据目录存在。 */
export function ensureEvolutionLayoutSync(workspaceRoot: string): void {
  const evo = workspaceEvolutionRootAbs(resolved(workspaceRoot));
  try {
    fs.mkdirSync(evo, { recursive: true });
    fs.mkdirSync(path.join(evo, 'backups'), { recursive: true });
  } catch (e) {
    console.warn('[workspace-evolution-layout] mkdir failed:', e);
  }
}
