/**
 * Hermes 记忆统一入口：索引内记忆 + 磁盘技能/知识库同步（封装 hermes-memory-db 与索引钩子）。
 */
import {
  getHermesMemoryDbPath,
  invalidateHermesMemoryDbCache,
  rebuildHermesSkillFtsIndex,
  searchHermesMemory,
  searchHermesMemoryFts,
  syncHermesTextSourcesToMemoryDb,
  type HermesMemorySearchHit,
  type HermesMemorySyncResult,
} from './hermes-memory-db';
import {
  WORKSPACE_HERMES_INDEX_REL,
  WORKSPACE_HERMES_NOTES_REL,
  WORKSPACE_HERMES_REL,
  workspaceHermesIndexDirAbs,
} from '../main/workspace/workspace-hermes-layout';

export type { HermesMemorySearchHit, HermesMemorySyncResult };

export function hermesPaths(workspaceRoot: string) {
  const root = String(workspaceRoot ?? '').trim();
  return {
    hermesRel: WORKSPACE_HERMES_REL,
    memoryRel: WORKSPACE_HERMES_NOTES_REL,
    indexRel: WORKSPACE_HERMES_INDEX_REL,
    indexDir: workspaceHermesIndexDirAbs(root),
    dbPath: getHermesMemoryDbPath(root),
  };
}

export function syncHermesMemory(
  workspaceRoot: string,
  opts?: { fullRebuild?: boolean }
): HermesMemorySyncResult {
  return syncHermesTextSourcesToMemoryDb(workspaceRoot, opts);
}

export function refreshHermesMemoryIndex(workspaceRoot: string): void {
  const r = syncHermesMemory(workspaceRoot, { fullRebuild: false });
  if (!r.ok) {
    console.warn('[hermes-memory-service] incremental sync failed:', r.error);
  }
}

export async function searchHermes(
  workspaceRoot: string,
  params: { query: string; limit?: number; skillName?: string }
) {
  return searchHermesMemory(workspaceRoot, params);
}

export function searchHermesFtsOnly(
  workspaceRoot: string,
  params: { query: string; limit?: number; skillName?: string }
) {
  return searchHermesMemoryFts(workspaceRoot, params);
}

export async function rebuildHermesIndex(workspaceRoot: string): Promise<HermesMemorySyncResult> {
  return rebuildHermesSkillFtsIndex(workspaceRoot);
}

export function evictHermesDbCache(workspaceRoot?: string): void {
  invalidateHermesMemoryDbCache(workspaceRoot);
}
