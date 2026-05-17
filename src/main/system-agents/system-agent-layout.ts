/**
 * 系统级子 Agent 根目录（应用缓存 `…/ClawFlowAppCache/system/`，不随工作区 Git 同步）。
 */

import * as path from 'path';
import { getEffectiveAppCacheRootSync } from '../prefs/app-cache-prefs';

export const SYSTEM_AGENTS_DIR_NAME = 'system';

export const SYSTEM_SUBAGENT_ROLE_DIR = '.subroleAgent';
export const SYSTEM_SUBCLAWFLOW_DIR = '.subclawflow';
export const SYSTEM_SUBMEMORY_DIR = '.submemory';
export const SYSTEM_CLAWFLOW_DIR = '.clawflow';

export function getSystemAgentsRootSync(): string {
  return path.join(getEffectiveAppCacheRootSync(), SYSTEM_AGENTS_DIR_NAME);
}

export function systemAgentsRootAbs(): string {
  return getSystemAgentsRootSync();
}

export function systemClawflowDirAbs(): string {
  return path.join(systemAgentsRootAbs(), SYSTEM_CLAWFLOW_DIR);
}

export function systemSubagentRootAbs(): string {
  return path.join(systemAgentsRootAbs(), '.subagent');
}

export function systemSubagentRolesDirAbs(): string {
  return path.join(systemSubagentRootAbs(), SYSTEM_SUBAGENT_ROLE_DIR);
}

export function systemSubclawflowDirAbs(): string {
  return path.join(systemSubagentRootAbs(), SYSTEM_SUBCLAWFLOW_DIR);
}

export function systemSubmemoryDirAbs(): string {
  return path.join(systemSubagentRootAbs(), SYSTEM_SUBMEMORY_DIR);
}

export function systemSubclawflowSlotDirAbs(slotId: string): string {
  const id = String(slotId ?? '').trim();
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) return systemSubclawflowDirAbs();
  return path.join(systemSubclawflowDirAbs(), id);
}

export function systemSubmemorySlotDirAbs(slotId: string): string {
  const id = String(slotId ?? '').trim();
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) return systemSubmemoryDirAbs();
  return path.join(systemSubmemoryDirAbs(), id);
}
