/**
 * 从工作区 `.subagent/` 清理已迁到系统级的子 Agent 遗留目录（Skill / 认知分配等）。
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  COGNITIVE_ALLOCATION_AGENT_SLOT_ID,
  SKILL_AGENT_SLOT_ID,
  SYSTEM_SUB_AGENT_SLOT_IDS_ORDERED,
} from '../../shared/system-agent-constants';
import { subclawflowSlotDirAbs, submemorySlotDirAbs } from '../workspace/workspace-service';
import { workspaceSubagentRolesDirAbs } from '../workspace/workspace-agent-layout';

/** 不得出现在工作区 `.subagent/.subroleAgent/` 下的角色模板 id（仅系统缓存托管） */
export const FORBIDDEN_WORKSPACE_SUBROLE_TEMPLATE_IDS = ['skills', 'cognitive-allocation'] as const;

const WORKSPACE_DELEGATE_SLOT_IDS = [
  'cf-sub-program',
  'cf-sub-creative',
  'cf-sub-data',
  'cf-sub-assistant',
] as const;

function rmIfExistsSync(target: string): void {
  try {
    fs.rmSync(target, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}

async function rmIfExists(target: string): Promise<void> {
  try {
    await fs.promises.rm(target, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}

function pruneCoreSync(root: string): void {
  const resolved = path.resolve(String(root ?? '').trim());
  if (!resolved) return;

  for (const id of SYSTEM_SUB_AGENT_SLOT_IDS_ORDERED) {
    rmIfExistsSync(subclawflowSlotDirAbs(resolved, id));
    rmIfExistsSync(submemorySlotDirAbs(resolved, id));
  }

  const roleRoot = workspaceSubagentRolesDirAbs(resolved);
  for (const roleId of FORBIDDEN_WORKSPACE_SUBROLE_TEMPLATE_IDS) {
    rmIfExistsSync(path.join(roleRoot, roleId));
  }

  const subagentRoot = path.join(resolved, '.subagent');
  try {
    const entries = fs.readdirSync(subagentRoot);
    if (entries.length === 0) {
      rmIfExistsSync(subagentRoot);
      return;
    }
    let hasDelegateSlot = false;
    for (const id of WORKSPACE_DELEGATE_SLOT_IDS) {
      try {
        fs.accessSync(subclawflowSlotDirAbs(resolved, id));
        hasDelegateSlot = true;
        break;
      } catch {
        /* continue */
      }
    }
    if (hasDelegateSlot) return;

    const subclaw = path.join(subagentRoot, '.subclawflow');
    const submem = path.join(subagentRoot, '.submemory');
    const onlySystemLegacy =
      entries.every((e) => e === '.subclawflow' || e === '.submemory' || e === '.subroleAgent') &&
      dirOnlyContainsSystemSlotIdsSync(subclaw) &&
      dirOnlyContainsSystemSlotIdsSync(submem);
    if (onlySystemLegacy) rmIfExistsSync(subagentRoot);
  } catch {
    /* no .subagent */
  }
}

function dirOnlyContainsSystemSlotIdsSync(base: string): boolean {
  try {
    const names = fs.readdirSync(base);
    if (names.length === 0) return true;
    const systemSet = new Set<string>([SKILL_AGENT_SLOT_ID, COGNITIVE_ALLOCATION_AGENT_SLOT_ID]);
    return names.every((n) => systemSet.has(n));
  } catch {
    return true;
  }
}

/** 同步清理（迁移链路用） */
export function pruneSystemSubagentArtifactsFromWorkspaceSync(workspaceRoot: string): void {
  pruneCoreSync(workspaceRoot);
}

/** 移除系统槽位在工作区下的缓存子目录及 Skill 角色模板副本 */
export async function pruneSystemSubagentArtifactsFromWorkspace(workspaceRoot: string): Promise<void> {
  pruneCoreSync(String(workspaceRoot ?? '').trim());
}
