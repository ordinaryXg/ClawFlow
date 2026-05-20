/**
 * 进化管线专用目录：`.agent/.evolution/`（备份、运行记录、调度状态）。
 */
import * as fs from 'fs';
import * as path from 'path';
import { workspaceAgentRootAbs } from './workspace-agent-layout';
import { clawflowDir } from './workspace-service';

export const WORKSPACE_EVOLUTION_REL = '.agent/.evolution';
export const WORKSPACE_EVOLUTION_BACKUPS_REL = '.agent/.evolution/backups';

export const EVOLUTION_RUNS_FILE = 'evolution-runs.v1.json';
export const EVOLUTION_STATE_FILE = 'skill-evolution-state.v1.json';

const LEGACY_BACKUPS_REL = '.agent/.clawflow/evolution-backups';

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

/** 从 `.agent/.clawflow/` 迁入 `.agent/.evolution/`（目标已存在则跳过）。 */
export function migrateEvolutionLayoutSync(workspaceRoot: string): void {
  const root = resolved(workspaceRoot);
  const agent = workspaceAgentRootAbs(root);
  const evo = workspaceEvolutionRootAbs(root);
  const clawflow = clawflowDir(root);

  try {
    fs.mkdirSync(evo, { recursive: true });
    fs.mkdirSync(path.join(evo, 'backups'), { recursive: true });
  } catch (e) {
    console.warn('[workspace-evolution-layout] mkdir failed:', e);
  }

  const tryMove = (from: string, to: string) => {
    try {
      if (!fs.existsSync(from)) return;
      if (fs.existsSync(to)) return;
      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.renameSync(from, to);
    } catch (e) {
      console.warn('[workspace-evolution-layout] migrate failed:', from, '->', to, e);
    }
  };

  tryMove(path.join(clawflow, 'evolution-backups'), path.join(evo, 'backups'));

  tryMove(path.join(clawflow, EVOLUTION_RUNS_FILE), evolutionRunsStorePath(root));
  tryMove(path.join(clawflow, EVOLUTION_STATE_FILE), evolutionStateStorePath(root));
}
