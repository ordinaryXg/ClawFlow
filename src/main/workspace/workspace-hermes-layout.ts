/**
 * Hermes：`.agent/.hermes/index/` 存放 SQLite 索引；记忆条目仅存于索引（逻辑路径 `.agent/.hermes/memory/`）。
 */
import * as fs from 'fs';
import * as path from 'path';
import { workspaceAgentRootAbs } from './workspace-agent-layout';
import { clawflowDir } from './workspace-service';
import { importLegacyNotesDirToHermesMemorySync, seedHermesMemoryReadmeIfEmpty } from '../../engine/hermes-memory-store';
import { migrateEvolutionLayoutSync } from './workspace-evolution-layout';

function invalidateHermesDbCacheBestEffort(workspaceRoot: string): void {
  try {
    const { invalidateHermesMemoryDbCache } = require('../../engine/hermes-memory-db') as typeof import('../../engine/hermes-memory-db');
    invalidateHermesMemoryDbCache(workspaceRoot);
  } catch {
    /* ignore */
  }
}

export const WORKSPACE_HERMES_REL = '.agent/.hermes';
export const WORKSPACE_HERMES_INDEX_REL = '.agent/.hermes/index';
export const HERMES_MEMORY_REL_PREFIX = '.agent/.hermes/memory';
export const WORKSPACE_HERMES_CHAT_DIGEST_REL = '.agent/.hermes/memory/_chat-digest';
export const HERMES_MEMORY_DB_FILENAME = 'hermes-memory.db';

/** @deprecated 记忆不再使用 notes 目录；逻辑路径见 `HERMES_MEMORY_REL_PREFIX` */
export const WORKSPACE_HERMES_NOTES_REL = '.agent/.hermes/memory';

/** @deprecated */
export const WORKSPACE_AGENT_DOT_MEMORY_REL = '.agent/.hermes/memory';

function resolvedWorkspaceRoot(workspaceRoot: string): string {
  return path.resolve(String(workspaceRoot ?? '').trim());
}

export function workspaceHermesRootAbs(workspaceRoot: string): string {
  return path.join(workspaceAgentRootAbs(workspaceRoot), '.hermes');
}

/** @deprecated 无磁盘目录；保留 API 以免旧调用崩溃，指向 `.agent/.hermes` 根 */
export function workspaceHermesNotesDirAbs(workspaceRoot: string): string {
  return workspaceHermesRootAbs(workspaceRoot);
}

export function workspaceHermesIndexDirAbs(workspaceRoot: string): string {
  return path.join(workspaceHermesRootAbs(workspaceRoot), 'index');
}

export function getHermesMemoryDbPath(workspaceRoot: string): string {
  return path.join(workspaceHermesIndexDirAbs(workspaceRoot), HERMES_MEMORY_DB_FILENAME);
}

export function isHermesNotesWorkspaceRel(rel: string): boolean {
  try {
    const { isHermesMemoryRel } = require('../../engine/hermes-memory-store') as typeof import('../../engine/hermes-memory-store');
    return isHermesMemoryRel(rel);
  } catch {
    return false;
  }
}

/**
 * Hermes / 进化目录迁移（每次打开工作区可安全调用）：
 * - 遗留 notes / `.memory` → 导入 Hermes DB 后删除目录
 * - `hermes-memory.db` → `.agent/.hermes/index/`
 * - 进化元数据 → `.agent/.evolution/`
 */
export function migrateHermesLayoutSync(workspaceRoot: string): void {
  const root = resolvedWorkspaceRoot(workspaceRoot);
  const agent = workspaceAgentRootAbs(root);
  const hermes = workspaceHermesRootAbs(root);
  const indexDir = workspaceHermesIndexDirAbs(root);

  try {
    fs.mkdirSync(hermes, { recursive: true });
    fs.mkdirSync(indexDir, { recursive: true });
  } catch (e) {
    console.warn('[workspace-hermes-layout] mkdir failed:', e);
  }

  const tryMove = (from: string, to: string) => {
    try {
      if (!fs.existsSync(from)) return;
      if (fs.existsSync(to)) return;
      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.renameSync(from, to);
    } catch (e) {
      console.warn('[workspace-hermes-layout] migrate rename failed:', from, '->', to, e);
    }
  };

  tryMove(path.join(agent, '.memory'), path.join(hermes, '.memory-legacy-import'));
  tryMove(path.join(hermes, 'notes'), path.join(hermes, 'notes-legacy-import'));

  const legacyDb = path.join(clawflowDir(root), HERMES_MEMORY_DB_FILENAME);
  const newDb = getHermesMemoryDbPath(root);
  if (legacyDb !== newDb) {
    const moved = fs.existsSync(legacyDb) && !fs.existsSync(newDb);
    tryMove(legacyDb, newDb);
    if (moved) {
      tryMove(`${legacyDb}-wal`, `${newDb}-wal`);
      tryMove(`${legacyDb}-shm`, `${newDb}-shm`);
      invalidateHermesDbCacheBestEffort(root);
    }
  }

  try {
    const legacyNotes = path.join(hermes, 'notes-legacy-import');
    const legacyMem = path.join(hermes, '.memory-legacy-import');
    importLegacyNotesDirToHermesMemorySync(root, legacyNotes);
    importLegacyNotesDirToHermesMemorySync(root, legacyMem);
    fs.rmSync(legacyNotes, { recursive: true, force: true });
    fs.rmSync(legacyMem, { recursive: true, force: true });
  } catch (e) {
    console.warn('[workspace-hermes-layout] legacy notes import failed:', e);
  }

  migrateMemoryMdRowsToHermesMemoryKind(root);
  migrateEvolutionLayoutSync(root);
  try {
    seedHermesMemoryReadmeIfEmpty(root);
  } catch {
    /* ignore */
  }
}

function migrateMemoryMdRowsToHermesMemoryKind(workspaceRoot: string): void {
  try {
    const { getOrOpenHermesMemoryDb } = require('../../engine/hermes-memory-db') as typeof import('../../engine/hermes-memory-db');
    const db = getOrOpenHermesMemoryDb(workspaceRoot);
    if (!db) return;
    const rows = db
      .prepare(`SELECT id, source_path FROM memory_docs WHERE source_kind = 'memory_md'`)
      .all() as { id: number; source_path: string }[];
    const upd = db.prepare(`UPDATE memory_docs SET source_kind = 'hermes_memory' WHERE id = ?`);
    for (const row of rows) {
      let rel = row.source_path;
      if (rel.includes('/notes/')) {
        rel = rel.replace('/.hermes/notes/', '/.hermes/memory/');
      } else if (rel.startsWith('.agent/.memory')) {
        rel = rel.replace('.agent/.memory', '.agent/.hermes/memory');
      }
      db.prepare(`UPDATE memory_docs SET source_path = ? WHERE id = ?`).run(rel, row.id);
      upd.run(row.id);
    }
  } catch {
    /* ignore */
  }
}
