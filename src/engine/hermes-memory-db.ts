/**
 * Hermes 工作区记忆库：`.agent/.clawflow/hermes-memory.db` + FTS5。
 * 仅 Main 进程使用；webpack 将 better-sqlite3 标为 external。
 * 使用 Electron 运行时前请执行 `npm run rebuild:native`，使原生模块与当前 Electron 版本匹配（Jest 使用 Node 预编译二进制，勿在仅跑测试后忘记重编译）。
 */

import * as fs from 'fs';
import * as path from 'path';
import { createRequire } from 'module';
import {
  workspaceAgentDotMemoryDirAbs,
  workspaceAgentKnowledgeDirAbs,
  workspaceSkillsDirAbs,
} from '../main/workspace/workspace-agent-layout';
import { rebuildKnowledgeManifest } from '../main/workspace/workspace-knowledge-manifest';
import { knowledgeIngestDirAbs } from '../main/workspace/workspace-knowledge-ingest';
import { conversationsStorePath } from '../main/workspace/workspace-service';
import { clawflowDir } from '../main/workspace/workspace-service';
import { parseWorkspaceMemoryMarkdown } from '../shared/workspace-memory-frontmatter';

/** CJS `export =`：类型上无 `.default`，运行时仍兼容 `default` 包装 */
type BetterSqliteCtor = typeof import('better-sqlite3');
type BetterSqliteDb = InstanceType<BetterSqliteCtor>;

let ctorCache: BetterSqliteCtor | null | undefined;
let ctorLoadError: string | undefined;

function resolveBetterSqliteCtor(mod: BetterSqliteCtor | { default: BetterSqliteCtor }): BetterSqliteCtor {
  return (mod as { default?: BetterSqliteCtor }).default ?? (mod as BetterSqliteCtor);
}

/** Webpack 主进程将 better-sqlite3 标为 commonjs external，优先用运行时 require。 */
export function getBetterSqliteCtor(): BetterSqliteCtor | null {
  if (ctorCache !== undefined) return ctorCache;

  const loaders: Array<() => BetterSqliteCtor | { default: BetterSqliteCtor }> = [
    () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      return require('better-sqlite3') as BetterSqliteCtor | { default: BetterSqliteCtor };
    },
    () => {
      const req = createRequire(path.join(process.cwd(), 'package.json'));
      return req('better-sqlite3') as BetterSqliteCtor | { default: BetterSqliteCtor };
    },
    () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { app } = require('electron') as typeof import('electron');
      const req = createRequire(path.join(app.getAppPath(), 'package.json'));
      return req('better-sqlite3') as BetterSqliteCtor | { default: BetterSqliteCtor };
    },
  ];

  for (const load of loaders) {
    try {
      ctorCache = resolveBetterSqliteCtor(load());
      ctorLoadError = undefined;
      return ctorCache;
    } catch (e) {
      ctorLoadError = e instanceof Error ? e.message : String(e);
    }
  }

  ctorCache = null;
  return null;
}

export function isHermesMemoryNativeLoaded(): boolean {
  return getBetterSqliteCtor() !== null;
}

export function getHermesMemoryLoadError(): string | undefined {
  if (ctorCache === undefined) getBetterSqliteCtor();
  return ctorLoadError;
}

const dbCache = new Map<string, BetterSqliteDb>();

export function getHermesMemoryDbPath(workspaceRoot: string): string {
  return path.join(clawflowDir(workspaceRoot), 'hermes-memory.db');
}

export function invalidateHermesMemoryDbCache(resolvedRoot?: string): void {
  if (resolvedRoot) {
    const key = path.resolve(resolvedRoot);
    const db = dbCache.get(key);
    if (db) {
      try {
        db.close();
      } catch {
        /* ignore */
      }
      dbCache.delete(key);
    }
    return;
  }
  for (const [, db] of dbCache) {
    try {
      db.close();
    } catch {
      /* ignore */
    }
  }
  dbCache.clear();
}

export function getOrOpenHermesMemoryDb(workspaceRoot: string): BetterSqliteDb | null {
  const Ctor = getBetterSqliteCtor();
  if (!Ctor) return null;
  const key = path.resolve(workspaceRoot);
  const existing = dbCache.get(key);
  if (existing) {
    try {
      existing.prepare('SELECT 1').get();
      return existing;
    } catch {
      try {
        existing.close();
      } catch {
        /* ignore */
      }
      dbCache.delete(key);
    }
  }
  const dir = clawflowDir(key);
  fs.mkdirSync(dir, { recursive: true });
  const dbPath = path.join(dir, 'hermes-memory.db');
  const db = new Ctor(dbPath);
  db.pragma('journal_mode = WAL');
  ensureHermesMemorySchema(db);
  dbCache.set(key, db);
  return db;
}

function ensureMemoryDocsColumn(db: BetterSqliteDb, column: string, ddl: string): void {
  const cols = db.prepare(`PRAGMA table_info(memory_docs)`).all() as { name: string }[];
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE memory_docs ADD COLUMN ${ddl}`);
  }
}

export function ensureHermesMemorySchema(db: BetterSqliteDb): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS memory_docs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_kind TEXT NOT NULL,
      source_path TEXT NOT NULL,
      skill_name TEXT,
      title TEXT,
      mtime_ms INTEGER NOT NULL,
      body TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_memory_docs_source_path ON memory_docs(source_path);
  `);
  ensureMemoryDocsColumn(db, 'abstract', 'abstract TEXT');
  ensureMemoryDocsColumn(db, 'overview', 'overview TEXT');

  const row = db.prepare(`SELECT 1 AS ok FROM sqlite_master WHERE type='table' AND name='memory_fts'`).get() as
    | { ok: number }
    | undefined;
  if (!row) {
    db.exec(`
      CREATE VIRTUAL TABLE memory_fts USING fts5(
        body,
        content='memory_docs',
        content_rowid='id',
        tokenize='unicode61'
      );
      CREATE TRIGGER memory_docs_ai AFTER INSERT ON memory_docs BEGIN
        INSERT INTO memory_fts(rowid, body) VALUES (new.id, new.body);
      END;
      CREATE TRIGGER memory_docs_ad AFTER DELETE ON memory_docs BEGIN
        INSERT INTO memory_fts(memory_fts, rowid) VALUES('delete', old.id);
      END;
      CREATE TRIGGER memory_docs_au AFTER UPDATE ON memory_docs BEGIN
        INSERT INTO memory_fts(memory_fts, rowid) VALUES('delete', old.id);
        INSERT INTO memory_fts(rowid, body) VALUES (new.id, new.body);
      END;
    `);
  }
}

export type HermesMemorySearchHit = {
  id: number;
  source_kind: string;
  source_path: string;
  skill_name: string | null;
  title: string | null;
  /** L0，仅 source_kind=memory_md 时通常有值 */
  abstract: string | null;
  /** L1，仅 source_kind=memory_md 时通常有值 */
  overview: string | null;
  snippet: string;
  rank: number;
};

function toPosixRel(workspaceRoot: string, absPath: string): string {
  return path.relative(path.resolve(workspaceRoot), absPath).split(path.sep).join('/');
}

function inferSkillNameFromIndexedPath(relPosix: string): string | null {
  for (const prefix of ['.agent/.skills/', '.agent/skills/', '.agent/.clawflow/skills/', '.clawflow/skills/'] as const) {
    if (!relPosix.startsWith(prefix)) continue;
    const rest = relPosix.slice(prefix.length);
    if (!rest) return null;
    const parts = rest.split('/');
    const base = parts[parts.length - 1];
    if (base === 'SKILL.md' && parts.length >= 2) {
      return parts[parts.length - 2] ?? null;
    }
    const refIdx = parts.indexOf('references');
    if (refIdx >= 1) {
      return parts[refIdx - 1] ?? null;
    }
    return null;
  }
  return null;
}

const TEXT_EXT = new Set(['.md', '.txt']);

function collectSkillIndexTargetsSync(
  workspaceRoot: string
): Array<{ abs: string; relPosix: string; source_kind: 'skill_md' | 'skill_aux' }> {
  const skillsRoot = workspaceSkillsDirAbs(workspaceRoot);
  const out: Array<{ abs: string; relPosix: string; source_kind: 'skill_md' | 'skill_aux' }> = [];
  function walk(dir: string): void {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      const abs = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        walk(abs);
      } else if (ent.isFile()) {
        const relPosix = toPosixRel(workspaceRoot, abs);
        if (ent.name === 'SKILL.md') {
          out.push({ abs, relPosix, source_kind: 'skill_md' });
          continue;
        }
        if (relPosix.includes('/references/')) {
          const ext = path.extname(ent.name).toLowerCase();
          if (TEXT_EXT.has(ext)) {
            out.push({ abs, relPosix, source_kind: 'skill_aux' });
          }
        }
      }
    }
  }
  try {
    fs.accessSync(skillsRoot);
  } catch {
    return [];
  }
  walk(skillsRoot);
  return out;
}

function collectMainMemoryIndexTargetsSync(
  workspaceRoot: string
): Array<{ abs: string; relPosix: string; source_kind: 'memory_md' }> {
  const memoryRoot = workspaceAgentDotMemoryDirAbs(workspaceRoot);
  const out: Array<{ abs: string; relPosix: string; source_kind: 'memory_md' }> = [];
  function walk(dir: string): void {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      const abs = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        walk(abs);
      } else if (ent.isFile() && ent.name.toLowerCase().endsWith('.md')) {
        out.push({
          abs,
          relPosix: toPosixRel(workspaceRoot, abs),
          source_kind: 'memory_md',
        });
      }
    }
  }
  try {
    fs.accessSync(memoryRoot);
  } catch {
    return [];
  }
  walk(memoryRoot);
  return out;
}

function collectKnowledgeIndexTargetsSync(
  workspaceRoot: string
): Array<{ abs: string; relPosix: string; source_kind: 'knowledge_md' | 'knowledge_txt' }> {
  const knowledgeRoot = workspaceAgentKnowledgeDirAbs(workspaceRoot);
  const out: Array<{ abs: string; relPosix: string; source_kind: 'knowledge_md' | 'knowledge_txt' }> = [];
  function walk(dir: string): void {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      const abs = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        walk(abs);
      } else if (ent.isFile()) {
        const ext = path.extname(ent.name).toLowerCase();
        if (ext === '.md') {
          out.push({
            abs,
            relPosix: toPosixRel(workspaceRoot, abs),
            source_kind: 'knowledge_md',
          });
        } else if (ext === '.txt') {
          out.push({
            abs,
            relPosix: toPosixRel(workspaceRoot, abs),
            source_kind: 'knowledge_txt',
          });
        }
      }
    }
  }
  try {
    fs.accessSync(knowledgeRoot);
  } catch {
    return [];
  }
  walk(knowledgeRoot);
  return out;
}

function buildFtsTokenQuery(raw: string): string {
  const tokens = raw
    .trim()
    .split(/\s+/u)
    .map((t) => t.replace(/["*]/g, '').trim())
    .filter((t) => t.length > 0)
    .slice(0, 16);
  if (!tokens.length) {
    throw new Error('empty query after tokenization');
  }
  return tokens.map((t) => `"${t.replace(/"/g, '""')}"`).join(' AND ');
}

function isSafeSkillNameFilter(name: string): boolean {
  return /^[a-zA-Z0-9._-]{1,128}$/.test(name);
}

/** FTS-only 检索（不含向量混合） */
export function searchHermesMemoryFts(
  workspaceRoot: string,
  params: { query: string; limit?: number; skillName?: string }
): { ok: true; hits: HermesMemorySearchHit[] } | { ok: false; error: string } {
  const db = getOrOpenHermesMemoryDb(workspaceRoot);
  if (!db) {
    return { ok: false, error: `better-sqlite3 unavailable: ${getHermesMemoryLoadError() ?? 'unknown'}` };
  }
  const q = String(params.query ?? '').trim();
  if (!q) return { ok: false, error: 'missing query' };
  let ftsQuery: string;
  try {
    ftsQuery = buildFtsTokenQuery(q);
  } catch {
    return { ok: false, error: 'could not tokenize query' };
  }
  const limitRaw = params.limit ?? 12;
  const limit = Math.min(50, Math.max(1, Math.floor(Number(limitRaw)) || 12));
  const skillFilter = String(params.skillName ?? '').trim();

  const sync = syncHermesTextSourcesToMemoryDb(workspaceRoot, { db, fullRebuild: false });
  if (!sync.ok) {
    return { ok: false, error: sync.error ?? 'sync failed' };
  }

  const selectCols = `
        d.id, d.source_kind, d.source_path, d.skill_name, d.title, d.abstract, d.overview,
        snippet(memory_fts, 0, '〈', '〉', '…', 40) AS snippet,
        bm25(memory_fts) AS rank`;

  try {
    if (skillFilter && isSafeSkillNameFilter(skillFilter)) {
      const stmt = db.prepare(`
        SELECT ${selectCols}
        FROM memory_fts
        JOIN memory_docs d ON d.id = memory_fts.rowid
        WHERE memory_fts MATCH ? AND d.skill_name = ?
        ORDER BY rank
        LIMIT ?
      `);
      const rows = stmt.all(ftsQuery, skillFilter, limit) as HermesMemorySearchHit[];
      return { ok: true, hits: rows };
    }
    const stmt = db.prepare(`
      SELECT ${selectCols}
      FROM memory_fts
      JOIN memory_docs d ON d.id = memory_fts.rowid
      WHERE memory_fts MATCH ?
      ORDER BY rank
      LIMIT ?
    `);
    const rows = stmt.all(ftsQuery, limit) as HermesMemorySearchHit[];
    return { ok: true, hits: rows };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}

/** FTS + 可选 sqlite-vec 混合检索 */
export async function searchHermesMemory(
  workspaceRoot: string,
  params: { query: string; limit?: number; skillName?: string }
): Promise<{ ok: true; hits: HermesMemorySearchHit[] } | { ok: false; error: string }> {
  const fts = searchHermesMemoryFts(workspaceRoot, params);
  if (!fts.ok) return fts;
  const db = getOrOpenHermesMemoryDb(workspaceRoot);
  if (!db) return fts;
  const limit = Math.min(50, Math.max(1, Math.floor(Number(params.limit ?? 12)) || 12));
  try {
    const { mergeHybridHermesHits } = await import('./hermes-memory-embeddings');
    const hits = await mergeHybridHermesHits(
      db as unknown as import('./hermes-memory-embeddings').HermesVecDb,
      fts.hits,
      String(params.query ?? ''),
      limit
    );
    return { ok: true, hits };
  } catch {
    return fts;
  }
}

export type HermesMemorySyncResult =
  | { ok: true; indexed: number; pruned: number }
  | { ok: false; error: string };

/**
 * 将 `.agent/.skills/**` 下 SKILL.md 与 references 内文本同步进 memory_docs（增量按 mtime；可全量重建）。兼容索引中仍存的 `.agent/skills/`、`.clawflow/skills/`、`.agent/.clawflow/skills/` 路径元数据。
 */
export function syncSkillTextSourcesToMemoryDb(
  workspaceRoot: string,
  opts?: { fullRebuild?: boolean; db?: BetterSqliteDb | null }
): HermesMemorySyncResult {
  const db = opts?.db ?? getOrOpenHermesMemoryDb(workspaceRoot);
  if (!db) {
    return { ok: false, error: `better-sqlite3 unavailable: ${getHermesMemoryLoadError() ?? 'unknown'}` };
  }
  const root = path.resolve(workspaceRoot);
  let indexed = 0;
  let pruned = 0;

  const delByPath = db.prepare(`DELETE FROM memory_docs WHERE source_path = ?`);
  const selectMeta = db.prepare(
    `SELECT mtime_ms FROM memory_docs WHERE source_path = ? AND source_kind IN ('skill_md','skill_aux')`
  );
  const insert = db.prepare(
    `INSERT INTO memory_docs (source_kind, source_path, skill_name, title, mtime_ms, body)
     VALUES (?, ?, ?, ?, ?, ?)`
  );

  const tx = db.transaction(() => {
    if (opts?.fullRebuild) {
      db.prepare(`DELETE FROM memory_docs WHERE source_kind IN ('skill_md', 'skill_aux')`).run();
    }

    const staleRows = db
      .prepare(
        `SELECT source_path FROM memory_docs WHERE source_kind IN ('skill_md', 'skill_aux')`
      )
      .all() as { source_path: string }[];

    for (const { source_path } of staleRows) {
      const abs = path.join(root, ...source_path.split('/'));
      try {
        fs.accessSync(abs);
      } catch {
        delByPath.run(source_path);
        pruned++;
      }
    }
  });

  try {
    tx();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }

  const runUpserts = db.transaction((targets: ReturnType<typeof collectSkillIndexTargetsSync>) => {
    for (const t of targets) {
      let st: fs.Stats;
      try {
        st = fs.statSync(t.abs);
      } catch {
        continue;
      }
      const mtimeMs = Math.trunc(st.mtimeMs);
      const prev = selectMeta.get(t.relPosix) as { mtime_ms: number } | undefined;
      if (!opts?.fullRebuild && prev && prev.mtime_ms >= mtimeMs) {
        continue;
      }
      let body: string;
      try {
        body = fs.readFileSync(t.abs, 'utf8');
      } catch {
        continue;
      }
      delByPath.run(t.relPosix);
      const skillName = inferSkillNameFromIndexedPath(t.relPosix);
      const title = path.basename(t.relPosix);
      insert.run(t.source_kind, t.relPosix, skillName, title, mtimeMs, body);
      indexed++;
    }
  });

  try {
    const targets = collectSkillIndexTargetsSync(root);
    runUpserts(targets);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }

  return { ok: true, indexed, pruned };
}

/** 将 `.agent/.memory/` 下 Markdown 同步进 memory_docs（L0/L1 列 + FTS 索引 abstract、overview、正文）。 */
export function syncMainMemorySourcesToMemoryDb(
  workspaceRoot: string,
  opts?: { fullRebuild?: boolean; db?: BetterSqliteDb | null }
): HermesMemorySyncResult {
  const db = opts?.db ?? getOrOpenHermesMemoryDb(workspaceRoot);
  if (!db) {
    return { ok: false, error: `better-sqlite3 unavailable: ${getHermesMemoryLoadError() ?? 'unknown'}` };
  }
  const root = path.resolve(workspaceRoot);
  let indexed = 0;
  let pruned = 0;

  const delByPath = db.prepare(`DELETE FROM memory_docs WHERE source_path = ?`);
  const selectMeta = db.prepare(
    `SELECT mtime_ms FROM memory_docs WHERE source_path = ? AND source_kind = 'memory_md'`
  );
  const insert = db.prepare(
    `INSERT INTO memory_docs (source_kind, source_path, skill_name, title, mtime_ms, body, abstract, overview)
     VALUES (?, ?, NULL, ?, ?, ?, ?, ?)`
  );

  const tx = db.transaction(() => {
    if (opts?.fullRebuild) {
      db.prepare(`DELETE FROM memory_docs WHERE source_kind = 'memory_md'`).run();
    }

    const staleRows = db
      .prepare(`SELECT source_path FROM memory_docs WHERE source_kind = 'memory_md'`)
      .all() as { source_path: string }[];

    for (const { source_path } of staleRows) {
      const abs = path.join(root, ...source_path.split('/'));
      try {
        fs.accessSync(abs);
      } catch {
        delByPath.run(source_path);
        pruned++;
      }
    }
  });

  try {
    tx();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }

  const runUpserts = db.transaction((targets: ReturnType<typeof collectMainMemoryIndexTargetsSync>) => {
    for (const t of targets) {
      let st: fs.Stats;
      try {
        st = fs.statSync(t.abs);
      } catch {
        continue;
      }
      const mtimeMs = Math.trunc(st.mtimeMs);
      const prev = selectMeta.get(t.relPosix) as { mtime_ms: number } | undefined;
      if (!opts?.fullRebuild && prev && prev.mtime_ms >= mtimeMs) {
        continue;
      }
      let raw: string;
      try {
        raw = fs.readFileSync(t.abs, 'utf8');
      } catch {
        continue;
      }
      const parsed = parseWorkspaceMemoryMarkdown(raw);
      delByPath.run(t.relPosix);
      const title = parsed.title?.trim() || path.basename(t.relPosix, '.md');
      insert.run(
        t.source_kind,
        t.relPosix,
        title,
        mtimeMs,
        parsed.ftsBody,
        parsed.abstract ?? null,
        parsed.overview ?? null
      );
      indexed++;
    }
  });

  try {
    runUpserts(collectMainMemoryIndexTargetsSync(root));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }

  return { ok: true, indexed, pruned };
}

/** 将 `.agent/knowledge/**` 下 Markdown/文本同步进 memory_docs。 */
export function syncKnowledgeSourcesToMemoryDb(
  workspaceRoot: string,
  opts?: { fullRebuild?: boolean; db?: BetterSqliteDb | null }
): HermesMemorySyncResult {
  const db = opts?.db ?? getOrOpenHermesMemoryDb(workspaceRoot);
  if (!db) {
    return { ok: false, error: `better-sqlite3 unavailable: ${getHermesMemoryLoadError() ?? 'unknown'}` };
  }
  const root = path.resolve(workspaceRoot);
  let indexed = 0;
  let pruned = 0;

  const delByPath = db.prepare(`DELETE FROM memory_docs WHERE source_path = ?`);
  const selectMeta = db.prepare(
    `SELECT mtime_ms FROM memory_docs WHERE source_path = ? AND source_kind IN ('knowledge_md', 'knowledge_txt')`
  );
  const insertMd = db.prepare(
    `INSERT INTO memory_docs (source_kind, source_path, skill_name, title, mtime_ms, body, abstract, overview)
     VALUES (?, ?, NULL, ?, ?, ?, ?, ?)`
  );
  const insertTxt = db.prepare(
    `INSERT INTO memory_docs (source_kind, source_path, skill_name, title, mtime_ms, body)
     VALUES (?, ?, NULL, ?, ?, ?)`
  );

  const tx = db.transaction(() => {
    if (opts?.fullRebuild) {
      db.prepare(`DELETE FROM memory_docs WHERE source_kind IN ('knowledge_md', 'knowledge_txt')`).run();
    }
    const staleRows = db
      .prepare(`SELECT source_path FROM memory_docs WHERE source_kind IN ('knowledge_md', 'knowledge_txt')`)
      .all() as { source_path: string }[];
    for (const { source_path } of staleRows) {
      const abs = path.join(root, ...source_path.split('/'));
      try {
        fs.accessSync(abs);
      } catch {
        delByPath.run(source_path);
        pruned++;
      }
    }
  });

  try {
    tx();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }

  const runUpserts = db.transaction((targets: ReturnType<typeof collectKnowledgeIndexTargetsSync>) => {
    for (const t of targets) {
      let st: fs.Stats;
      try {
        st = fs.statSync(t.abs);
      } catch {
        continue;
      }
      const mtimeMs = Math.trunc(st.mtimeMs);
      const prev = selectMeta.get(t.relPosix) as { mtime_ms: number } | undefined;
      if (!opts?.fullRebuild && prev && prev.mtime_ms >= mtimeMs) {
        continue;
      }
      let raw: string;
      try {
        raw = fs.readFileSync(t.abs, 'utf8');
      } catch {
        continue;
      }
      delByPath.run(t.relPosix);
      if (t.source_kind === 'knowledge_md') {
        const parsed = parseWorkspaceMemoryMarkdown(raw);
        const title = parsed.title?.trim() || path.basename(t.relPosix, '.md');
        insertMd.run(
          t.source_kind,
          t.relPosix,
          title,
          mtimeMs,
          parsed.ftsBody,
          parsed.abstract ?? null,
          parsed.overview ?? null
        );
      } else {
        const title = path.basename(t.relPosix, path.extname(t.relPosix));
        insertTxt.run(t.source_kind, t.relPosix, title, mtimeMs, raw);
      }
      indexed++;
    }
  });

  try {
    runUpserts(collectKnowledgeIndexTargetsSync(root));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }

  return { ok: true, indexed, pruned };
}

function collectKnowledgeIngestIndexTargetsSync(
  workspaceRoot: string
): Array<{ abs: string; relPosix: string; source_kind: 'knowledge_ingest_md' }> {
  const ingestRoot = knowledgeIngestDirAbs(workspaceRoot);
  const out: Array<{ abs: string; relPosix: string; source_kind: 'knowledge_ingest_md' }> = [];
  function walk(dir: string): void {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      const abs = path.join(dir, ent.name);
      if (ent.isDirectory()) walk(abs);
      else if (ent.isFile() && ent.name.toLowerCase().endsWith('.md')) {
        out.push({
          abs,
          relPosix: toPosixRel(workspaceRoot, abs),
          source_kind: 'knowledge_ingest_md',
        });
      }
    }
  }
  try {
    fs.accessSync(ingestRoot);
  } catch {
    return [];
  }
  walk(ingestRoot);
  return out;
}

export function syncKnowledgeIngestSourcesToMemoryDb(
  workspaceRoot: string,
  opts?: { fullRebuild?: boolean; db?: BetterSqliteDb | null }
): HermesMemorySyncResult {
  const db = opts?.db ?? getOrOpenHermesMemoryDb(workspaceRoot);
  if (!db) {
    return { ok: false, error: `better-sqlite3 unavailable: ${getHermesMemoryLoadError() ?? 'unknown'}` };
  }
  const root = path.resolve(workspaceRoot);
  let indexed = 0;
  let pruned = 0;
  const delByPath = db.prepare(`DELETE FROM memory_docs WHERE source_path = ?`);
  const selectMeta = db.prepare(
    `SELECT mtime_ms FROM memory_docs WHERE source_path = ? AND source_kind = 'knowledge_ingest_md'`
  );
  const insert = db.prepare(
    `INSERT INTO memory_docs (source_kind, source_path, skill_name, title, mtime_ms, body, abstract, overview)
     VALUES (?, ?, NULL, ?, ?, ?, ?, ?)`
  );

  const tx = db.transaction(() => {
    if (opts?.fullRebuild) {
      db.prepare(`DELETE FROM memory_docs WHERE source_kind = 'knowledge_ingest_md'`).run();
    }
    const stale = db
      .prepare(`SELECT source_path FROM memory_docs WHERE source_kind = 'knowledge_ingest_md'`)
      .all() as { source_path: string }[];
    for (const { source_path } of stale) {
      const abs = path.join(root, ...source_path.split('/'));
      try {
        fs.accessSync(abs);
      } catch {
        delByPath.run(source_path);
        pruned++;
      }
    }
  });
  try {
    tx();
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }

  const runUpserts = db.transaction((targets: ReturnType<typeof collectKnowledgeIngestIndexTargetsSync>) => {
    for (const t of targets) {
      let st: fs.Stats;
      try {
        st = fs.statSync(t.abs);
      } catch {
        continue;
      }
      const mtimeMs = Math.trunc(st.mtimeMs);
      const prev = selectMeta.get(t.relPosix) as { mtime_ms: number } | undefined;
      if (!opts?.fullRebuild && prev && prev.mtime_ms >= mtimeMs) continue;
      let raw: string;
      try {
        raw = fs.readFileSync(t.abs, 'utf8');
      } catch {
        continue;
      }
      const parsed = parseWorkspaceMemoryMarkdown(raw);
      delByPath.run(t.relPosix);
      const title = parsed.title?.trim() || path.basename(t.relPosix, '.md');
      insert.run(
        t.source_kind,
        t.relPosix,
        title,
        mtimeMs,
        parsed.ftsBody,
        parsed.abstract ?? null,
        parsed.overview ?? null
      );
      indexed++;
    }
  });

  try {
    runUpserts(collectKnowledgeIngestIndexTargetsSync(root));
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  return { ok: true, indexed, pruned };
}

type ConversationRow = {
  id: string;
  title?: string;
  updatedAt?: number;
  messages?: Array<{ role?: string; content?: string }>;
};

function buildConversationSummaryBody(conv: ConversationRow): string {
  const title = String(conv.title ?? '对话').trim() || '对话';
  const msgs = (conv.messages ?? []).filter(
    (m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string'
  );
  const tail = msgs.slice(-24);
  const lines: string[] = [`# ${title}`, '', `conversation_id: ${conv.id}`, ''];
  for (const m of tail) {
    const role = m.role === 'user' ? 'User' : 'Assistant';
    let text = String(m.content ?? '')
      .replace(/\s+/g, ' ')
      .trim();
    if (text.length > 400) text = `${text.slice(0, 400)}…`;
    if (!text) continue;
    lines.push(`## ${role}`, '', text, '');
  }
  let body = lines.join('\n').trim();
  if (body.length > 12_000) body = `${body.slice(0, 12_000)}\n… (truncated)`;
  return body;
}

export function syncConversationSummariesToMemoryDb(
  workspaceRoot: string,
  opts?: { fullRebuild?: boolean; db?: BetterSqliteDb | null }
): HermesMemorySyncResult {
  const db = opts?.db ?? getOrOpenHermesMemoryDb(workspaceRoot);
  if (!db) {
    return { ok: false, error: `better-sqlite3 unavailable: ${getHermesMemoryLoadError() ?? 'unknown'}` };
  }

  const storePath = conversationsStorePath(path.resolve(workspaceRoot));
  let conversations: ConversationRow[] = [];
  try {
    const raw = JSON.parse(fs.readFileSync(storePath, 'utf-8')) as unknown;
    if (Array.isArray(raw)) conversations = raw as ConversationRow[];
    else if (raw && typeof raw === 'object' && Array.isArray((raw as { conversations?: unknown }).conversations)) {
      conversations = (raw as { conversations: ConversationRow[] }).conversations;
    }
  } catch {
    conversations = [];
  }

  let indexed = 0;
  let pruned = 0;
  const delByPath = db.prepare(`DELETE FROM memory_docs WHERE source_path = ?`);
  const delAll = db.prepare(`DELETE FROM memory_docs WHERE source_kind = 'conversation_summary'`);
  const insert = db.prepare(
    `INSERT INTO memory_docs (source_kind, source_path, skill_name, title, mtime_ms, body, abstract, overview)
     VALUES ('conversation_summary', ?, NULL, ?, ?, ?, ?, NULL)`
  );
  const activePaths = new Set<string>();

  const tx = db.transaction(() => {
    if (opts?.fullRebuild) delAll.run();
    for (const conv of conversations) {
      if (!conv?.id) continue;
      const rel = `.agent/.clawflow/conversation-index/${conv.id}.md`;
      activePaths.add(rel);
      const mtimeMs = Math.trunc(typeof conv.updatedAt === 'number' ? conv.updatedAt : Date.now());
      const title = String(conv.title ?? '对话').trim() || '对话';
      delByPath.run(rel);
      insert.run(rel, title, mtimeMs, buildConversationSummaryBody(conv), `Chat · ${title}`);
      indexed++;
    }
    const stale = db
      .prepare(`SELECT source_path FROM memory_docs WHERE source_kind = 'conversation_summary'`)
      .all() as { source_path: string }[];
    for (const { source_path } of stale) {
      if (!activePaths.has(source_path)) {
        delByPath.run(source_path);
        pruned++;
      }
    }
  });

  try {
    tx();
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  return { ok: true, indexed, pruned };
}

/** 同步技能树 + 主记忆目录（检索前增量、重建时全量） */
export function syncHermesTextSourcesToMemoryDb(
  workspaceRoot: string,
  opts?: { fullRebuild?: boolean; db?: BetterSqliteDb | null }
): HermesMemorySyncResult {
  const db = opts?.db ?? getOrOpenHermesMemoryDb(workspaceRoot);
  if (!db) {
    return { ok: false, error: `better-sqlite3 unavailable: ${getHermesMemoryLoadError() ?? 'unknown'}` };
  }
  const skill = syncSkillTextSourcesToMemoryDb(workspaceRoot, { ...opts, db });
  if (!skill.ok) return skill;
  const mem = syncMainMemorySourcesToMemoryDb(workspaceRoot, { ...opts, db });
  if (!mem.ok) return mem;
  const kb = syncKnowledgeSourcesToMemoryDb(workspaceRoot, { ...opts, db });
  if (!kb.ok) return kb;
  const ingest = syncKnowledgeIngestSourcesToMemoryDb(workspaceRoot, { ...opts, db });
  if (!ingest.ok) return ingest;
  const conv = syncConversationSummariesToMemoryDb(workspaceRoot, { ...opts, db });
  if (!conv.ok) return conv;
  try {
    rebuildKnowledgeManifest(workspaceRoot);
  } catch {
    /* ignore */
  }
  return {
    ok: true,
    indexed: skill.indexed + mem.indexed + kb.indexed + ingest.indexed + conv.indexed,
    pruned: skill.pruned + mem.pruned + kb.pruned + ingest.pruned + conv.pruned,
  };
}

/** async 封装：供 IPC / 仅 async 上下文调用 */
export async function syncSkillTextSourcesToMemoryDbAsync(
  workspaceRoot: string,
  opts?: { fullRebuild?: boolean }
): Promise<HermesMemorySyncResult> {
  if (opts?.fullRebuild) {
    invalidateHermesMemoryDbCache(workspaceRoot);
  }
  const db = getOrOpenHermesMemoryDb(workspaceRoot);
  return syncSkillTextSourcesToMemoryDb(workspaceRoot, { ...opts, db });
}

export async function syncHermesTextSourcesToMemoryDbAsync(
  workspaceRoot: string,
  opts?: { fullRebuild?: boolean }
): Promise<HermesMemorySyncResult> {
  if (opts?.fullRebuild) {
    invalidateHermesMemoryDbCache(workspaceRoot);
  }
  const db = getOrOpenHermesMemoryDb(workspaceRoot);
  return syncHermesTextSourcesToMemoryDb(workspaceRoot, { ...opts, db });
}

export async function rebuildHermesSkillFtsIndex(workspaceRoot: string): Promise<HermesMemorySyncResult> {
  invalidateHermesMemoryDbCache(workspaceRoot);
  const res = await syncHermesTextSourcesToMemoryDbAsync(workspaceRoot, { fullRebuild: true });
  if (!res.ok) return res;
  const db = getOrOpenHermesMemoryDb(workspaceRoot);
  if (db) {
    try {
      const { rebuildHermesMemoryEmbeddings } = await import('./hermes-memory-embeddings');
      await rebuildHermesMemoryEmbeddings(
        db as unknown as import('./hermes-memory-embeddings').HermesVecDb
      );
    } catch (e) {
      console.warn('[hermes] embedding rebuild failed:', e);
    }
  }
  return res;
}
