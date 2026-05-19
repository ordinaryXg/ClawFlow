/**
 * 移除工作区 `.subagent/` 及工作区委派子 Agent 遗留文件。
 * 系统级子 Agent（Skill / 认知分配 / 预期规划）在应用缓存，见 `system-agents/`。
 */

import * as fs from 'fs';
import * as path from 'path';
import { workspaceAgentRootAbs, workspaceSubagentRootAbs, workspaceToolDirAbs } from './workspace-agent-layout';

function rmIfExistsSync(target: string): void {
  try {
    fs.rmSync(target, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}

function workspaceClawflowDirAbs(workspaceRoot: string): string {
  return path.join(workspaceAgentRootAbs(workspaceRoot), '.clawflow');
}

/** 打开/初始化工作区时清理工作区子 Agent 目录与名册（不影响系统缓存）。 */
export function pruneLegacyWorkspaceSubagentArtifactsSync(workspaceRoot: string): void {
  const resolved = path.resolve(String(workspaceRoot ?? '').trim());
  if (!resolved) return;

  rmIfExistsSync(workspaceSubagentRootAbs(resolved));

  const clawflow = workspaceClawflowDirAbs(resolved);
  for (const name of ['sub-agents.v1.json', 'sub-agents-run-snapshots.v1.json']) {
    rmIfExistsSync(path.join(clawflow, name));
  }

  rmIfExistsSync(path.join(workspaceToolDirAbs(resolved), 'subagents.md'));
}
