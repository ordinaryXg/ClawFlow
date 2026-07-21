/**
 * Hermes 记忆统一入口：索引内记忆 + 磁盘技能/知识库同步（封装 hermes-memory-db 与索引钩子）。
 */
import {
  getHermesMemoryDbPath,
  getHermesMemoryVectorIndexStatus,
  invalidateHermesMemoryDbCache,
  rebuildHermesSkillFtsIndex,
  searchHermesMemory,
  searchHermesMemoryFts,
  syncHermesTextSourcesToMemoryDb,
  type HermesMemorySearchHit,
  type HermesMemorySyncResult,
} from './hermes-memory-db';
import {
  HERMES_MEMORY_REL_PREFIX,
  WORKSPACE_HERMES_INDEX_REL,
  WORKSPACE_HERMES_REL,
  workspaceHermesIndexDirAbs,
} from '../../main/workspace/workspace-hermes-layout';

export type { HermesMemorySearchHit, HermesMemorySyncResult };
export { getHermesMemoryVectorIndexStatus };

export function hermesPaths(workspaceRoot: string) {
  const root = String(workspaceRoot ?? '').trim();
  return {
    hermesRel: WORKSPACE_HERMES_REL,
    memoryRel: HERMES_MEMORY_REL_PREFIX,
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
  void refreshHermesMemoryIndexAsync(workspaceRoot).catch((e) => {
    console.warn('[hermes-memory-service] refresh failed:', e);
  });
}

/** FTS 增量同步后补写缺失向量（混合 RAG 闭环）。 */
export async function refreshHermesMemoryIndexAsync(workspaceRoot: string): Promise<void> {
  const r = syncHermesMemory(workspaceRoot, { fullRebuild: false });
  if (!r.ok) {
    console.warn('[hermes-memory-service] incremental sync failed:', r.error);
    return;
  }
  const dbModule = await import('./hermes-memory-db');
  const db = dbModule.getOrOpenHermesMemoryDb(workspaceRoot);
  if (!db) return;
  try {
    const { syncHermesMemoryEmbeddingsIncremental } = await import('./hermes-memory-embeddings');
    const vec = await syncHermesMemoryEmbeddingsIncremental(
      db as unknown as import('./hermes-memory-embeddings').HermesVecDb
    );
    if (!vec.ok) {
      console.warn('[hermes-memory-service] embedding sync failed:', vec.error);
    }
  } catch (e) {
    console.warn('[hermes-memory-service] embedding sync failed:', e);
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

export async function rebuildHermesIndex(workspaceRoot: string): Promise<HermesMemorySyncResult & { embedded?: number }> {
  return rebuildHermesSkillFtsIndex(workspaceRoot);
}

export function evictHermesDbCache(workspaceRoot?: string): void {
  invalidateHermesMemoryDbCache(workspaceRoot);
}

/** 单条记忆 upsert / 删除后立即尝试补写或清理向量。 */
export async function syncHermesMemoryEmbeddingsForWorkspace(workspaceRoot: string): Promise<void> {
  const { getOrOpenHermesMemoryDb } = await import('./hermes-memory-db');
  const db = getOrOpenHermesMemoryDb(workspaceRoot);
  if (!db) return;
  const { syncHermesMemoryEmbeddingsIncremental } = await import('./hermes-memory-embeddings');
  await syncHermesMemoryEmbeddingsIncremental(
    db as unknown as import('./hermes-memory-embeddings').HermesVecDb
  );
}
