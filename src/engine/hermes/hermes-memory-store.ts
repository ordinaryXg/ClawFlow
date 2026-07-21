/**
 * Hermes 记忆条目（仅存于 `memory_docs`，无独立 notes 目录）。
 * 逻辑路径前缀：`.agent/.hermes/memory/`
 */
import * as fs from 'fs';
import * as path from 'path';
import {
  getOrOpenHermesMemoryDb,
  getHermesMemoryLoadError,
  syncHermesTextSourcesToMemoryDb,
} from '../hermes/hermes-memory-db';
import {
  parseWorkspaceMemoryMarkdown,
  serializeWorkspaceMemoryMarkdown,
} from '../../shared/workspace-memory-frontmatter';
import { HERMES_MEMORY_REL_PREFIX } from '../../main/workspace/workspace-hermes-layout';

export { HERMES_MEMORY_REL_PREFIX };

export function normalizeHermesMemoryRel(rel: string): string {
  const n = String(rel ?? '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\/+/, '');
  if (n === HERMES_MEMORY_REL_PREFIX || n.startsWith(`${HERMES_MEMORY_REL_PREFIX}/`)) {
    return n;
  }
  throw new Error('path_must_be_under_hermes_memory');
}

export function isHermesMemoryRel(rel: string): boolean {
  try {
    normalizeHermesMemoryRel(rel);
    return true;
  } catch {
    return false;
  }
}

export type HermesMemoryDocRow = {
  source_path: string;
  title: string | null;
  abstract: string | null;
  overview: string | null;
  body: string;
  mtime_ms: number;
};

function requireDb(workspaceRoot: string) {
  const db = getOrOpenHermesMemoryDb(workspaceRoot);
  if (!db) {
    throw new Error(`better-sqlite3 unavailable: ${getHermesMemoryLoadError() ?? 'unknown'}`);
  }
  return db;
}

export function listHermesMemoryDocuments(workspaceRoot: string): HermesMemoryDocRow[] {
  const db = requireDb(workspaceRoot);
  return db
    .prepare(
      `SELECT source_path, title, abstract, overview, body, mtime_ms
       FROM memory_docs
       WHERE source_kind = 'hermes_memory'
       ORDER BY mtime_ms DESC`
    )
    .all() as HermesMemoryDocRow[];
}

export function upsertHermesMemoryDocument(
  workspaceRoot: string,
  params: {
    relativePath: string;
    title?: string;
    abstract?: string;
    overview?: string;
    body: string;
  }
): { ok: true; source_path: string } | { ok: false; error: string } {
  try {
    const rel = normalizeHermesMemoryRel(params.relativePath);
    if (!rel.endsWith('.md')) {
      return { ok: false, error: 'memory_entries_must_be_md' };
    }
    const db = requireDb(workspaceRoot);
    const mtimeMs = Date.now();
    const title = String(params.title ?? '').trim() || path.basename(rel, '.md');
    const abstract = params.abstract != null ? String(params.abstract) : null;
    const overview = params.overview != null ? String(params.overview) : null;
    const body = String(params.body ?? '');
    const ftsBody = [abstract, overview, body].filter(Boolean).join('\n\n');

    db.prepare(`DELETE FROM memory_docs WHERE source_path = ?`).run(rel);
    db.prepare(
      `INSERT INTO memory_docs (source_kind, source_path, skill_name, title, mtime_ms, body, abstract, overview)
       VALUES ('hermes_memory', ?, NULL, ?, ?, ?, ?, ?)`
    ).run(rel, title, mtimeMs, ftsBody, abstract, overview);

    void import('./hermes-memory-service')
      .then(({ syncHermesMemoryEmbeddingsForWorkspace }) => syncHermesMemoryEmbeddingsForWorkspace(workspaceRoot))
      .catch(() => undefined);

    return { ok: true, source_path: rel };
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export function deleteHermesMemoryDocument(
  workspaceRoot: string,
  relativePath: string
): { ok: true } | { ok: false; error: string } {
  try {
    const rel = normalizeHermesMemoryRel(relativePath);
    const db = requireDb(workspaceRoot);
    db.prepare(`DELETE FROM memory_docs WHERE source_path = ? AND source_kind = 'hermes_memory'`).run(rel);
    void import('./hermes-memory-service')
      .then(({ syncHermesMemoryEmbeddingsForWorkspace }) => syncHermesMemoryEmbeddingsForWorkspace(workspaceRoot))
      .catch(() => undefined);
    return { ok: true };
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** 将 DB 中记忆条目序列化为带 frontmatter 的 Markdown（供进化快照 / 展示）。 */
export function serializeHermesMemoryDocRow(row: HermesMemoryDocRow): string {
  return serializeWorkspaceMemoryMarkdown({
    title: row.title ?? undefined,
    abstract: row.abstract ?? undefined,
    overview: row.overview ?? undefined,
    body: row.body,
  });
}

/** 进化 / 调度：从 Hermes 索引读取记忆摘录（先增量同步技能与知识库，记忆条目已在 DB）。 */
export function buildHermesMemoryExcerpt(workspaceRoot: string, maxChars: number): string {
  const root = path.resolve(workspaceRoot);
  void syncHermesTextSourcesToMemoryDb(root, { fullRebuild: false });
  let rows: HermesMemoryDocRow[] = [];
  try {
    rows = listHermesMemoryDocuments(root);
  } catch {
    return '';
  }
  const parts: string[] = [];
  let used = 0;
  for (const row of rows) {
    if (used >= maxChars) break;
    const header = `\n### ${row.source_path}\n`;
    const text = serializeHermesMemoryDocRow(row);
    const rest = text.slice(0, Math.max(0, maxChars - used - header.length));
    parts.push(header + rest);
    used += header.length + rest.length;
  }
  return parts.join('\n').trim();
}

/** 进化 diff：记忆维度以逻辑路径为键（内容来自 Hermes DB）。 */
export function snapshotHermesMemoryDocuments(workspaceRoot: string): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    for (const row of listHermesMemoryDocuments(workspaceRoot)) {
      out[row.source_path] = serializeHermesMemoryDocRow(row);
    }
  } catch {
    /* empty */
  }
  return out;
}

export function seedHermesMemoryReadmeIfEmpty(workspaceRoot: string): void {
  let rows: HermesMemoryDocRow[] = [];
  try {
    rows = listHermesMemoryDocuments(workspaceRoot);
  } catch {
    return;
  }
  if (rows.length > 0) return;
  upsertHermesMemoryDocument(workspaceRoot, {
    relativePath: `${HERMES_MEMORY_REL_PREFIX}/README.md`,
    title: 'Hermes 记忆',
    abstract: '跨会话记忆存放在 Hermes 索引中，由进化流程与 Agent 工具维护。',
    overview: '使用 hermes_memory_upsert / hermes_search 读写。',
    body: '## 说明\n\n记忆条目仅存在于 Hermes 索引（`.agent/.hermes/index/hermes-memory.db`），由进化「记忆整理」阶段维护。',
  });
}
