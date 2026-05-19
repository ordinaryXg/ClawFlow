/**
 * Hermes 向量层：sqlite-vec + 可选 Ollama/OpenAI embedding；与 FTS 混合检索。
 */

import type { HermesMemorySearchHit } from './hermes-memory-db';

/** sqlite-vec 与 better-sqlite3 共用的最小 Database 面（避免 Statement 泛型不兼容）。 */
export type HermesVecDb = {
  prepare: (sql: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    run: (...args: any[]) => unknown;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    all: (...args: any[]) => unknown[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    get: (...args: any[]) => unknown;
  };
  exec: (sql: string) => void;
  transaction: (fn: (rows: unknown) => void) => (rows: unknown) => void;
};

let sqliteVecLoadAttempted = false;
let sqliteVecAvailable = false;

function tryLoadSqliteVec(db: HermesVecDb): boolean {
  if (sqliteVecLoadAttempted) return sqliteVecAvailable;
  sqliteVecLoadAttempted = true;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const sqliteVec = require('sqlite-vec') as { load: (d: HermesVecDb) => void };
    sqliteVec.load(db);
    const row = db.prepare('SELECT vec_version() AS v').get() as { v?: string };
    sqliteVecAvailable = Boolean(row?.v);
  } catch (e) {
    console.warn('[hermes-vec] sqlite-vec load failed:', e);
    sqliteVecAvailable = false;
  }
  return sqliteVecAvailable;
}

export function isHermesVectorSearchAvailable(db: HermesVecDb | null): boolean {
  if (!db) return false;
  const { resolveHermesEmbeddingPrefs } = require('../main/prefs/hermes-embedding-prefs') as typeof import('../main/prefs/hermes-embedding-prefs');
  if (!resolveHermesEmbeddingPrefs().enabled) return false;
  return tryLoadSqliteVec(db);
}

function ensureVecTable(db: HermesVecDb, dimensions: number): void {
  db.exec(`DROP TABLE IF EXISTS memory_vec;`);
  db.exec(
    `CREATE VIRTUAL TABLE memory_vec USING vec0(
      doc_id INTEGER PRIMARY KEY,
      embedding float[${dimensions}]
    );`
  );
}

async function fetchEmbedding(text: string): Promise<Float32Array | null> {
  const { resolveHermesEmbeddingPrefs } = await import('../main/prefs/hermes-embedding-prefs');
  const prefs = resolveHermesEmbeddingPrefs();
  const input = text.slice(0, 8000);
  if (!input.trim()) return null;

  try {
    if (prefs.provider === 'ollama') {
      const url = `${prefs.baseUrl.replace(/\/+$/, '')}/api/embeddings`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: prefs.model, prompt: input }),
      });
      if (!res.ok) return null;
      const j = (await res.json()) as { embedding?: number[] };
      if (!Array.isArray(j.embedding) || j.embedding.length === 0) return null;
      return new Float32Array(j.embedding);
    }

    const url = `${prefs.baseUrl.replace(/\/+$/, '')}/embeddings`;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (prefs.apiKey) headers.Authorization = `Bearer ${prefs.apiKey}`;
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ model: prefs.model, input }),
    });
    if (!res.ok) return null;
    const j = (await res.json()) as { data?: Array<{ embedding?: number[] }> };
    const emb = j.data?.[0]?.embedding;
    if (!Array.isArray(emb) || emb.length === 0) return null;
    return new Float32Array(emb);
  } catch (e) {
    console.warn('[hermes-vec] embedding request failed:', e);
    return null;
  }
}

export async function rebuildHermesMemoryEmbeddings(
  db: HermesVecDb
): Promise<{ ok: true; embedded: number } | { ok: false; error: string }> {
  const { resolveHermesEmbeddingPrefs } = await import('../main/prefs/hermes-embedding-prefs');
  const prefs = resolveHermesEmbeddingPrefs();
  if (!prefs.enabled) return { ok: true, embedded: 0 };
  if (!tryLoadSqliteVec(db)) {
    return { ok: false, error: 'sqlite-vec extension unavailable' };
  }

  const rows = db.prepare(`SELECT id, body FROM memory_docs ORDER BY id`).all() as {
    id: number;
    body: string;
  }[];

  let dimensions = prefs.dimensions;
  ensureVecTable(db, dimensions);
  const insert = db.prepare(`INSERT INTO memory_vec(doc_id, embedding) VALUES (?, ?)`);

  let embedded = 0;
  for (const row of rows) {
    const vec = await fetchEmbedding(row.body);
    if (!vec) continue;
    if (embedded === 0 && vec.length !== dimensions) {
      dimensions = vec.length;
      ensureVecTable(db, dimensions);
    }
    try {
      insert.run(row.id, vec);
      embedded++;
    } catch {
      /* skip */
    }
  }

  return { ok: true, embedded };
}

export async function searchHermesMemoryVectorAsync(
  db: HermesVecDb,
  query: string,
  limit: number
): Promise<Array<{ doc_id: number; distance: number }>> {
  if (!isHermesVectorSearchAvailable(db)) return [];
  const qVec = await fetchEmbedding(query);
  if (!qVec) return [];
  try {
    const stmt = db.prepare(
      `SELECT doc_id, distance FROM memory_vec WHERE embedding MATCH ? ORDER BY distance LIMIT ?`
    );
    return stmt.all(qVec, limit) as Array<{ doc_id: number; distance: number }>;
  } catch {
    return [];
  }
}

export async function mergeHybridHermesHits(
  db: HermesVecDb,
  ftsHits: HermesMemorySearchHit[],
  query: string,
  limit: number
): Promise<HermesMemorySearchHit[]> {
  const { resolveHermesEmbeddingPrefs } = await import('../main/prefs/hermes-embedding-prefs');
  const prefs = resolveHermesEmbeddingPrefs();
  if (!prefs.enabled || !isHermesVectorSearchAvailable(db)) {
    return ftsHits.slice(0, limit);
  }

  const vectorRows = await searchHermesMemoryVectorAsync(db, query, Math.min(limit * 3, 50));
  if (!vectorRows.length) return ftsHits.slice(0, limit);

  const ftsById = new Map(ftsHits.map((h) => [h.id, h]));
  let minRank = 0;
  let maxRank = 0;
  for (const h of ftsHits) {
    if (h.rank < minRank) minRank = h.rank;
    if (h.rank > maxRank) maxRank = h.rank;
  }
  const rankSpan = maxRank - minRank || 1;

  let maxDist = 0;
  for (const r of vectorRows) {
    if (r.distance > maxDist) maxDist = r.distance;
  }

  const ids = new Set<number>();
  for (const h of ftsHits) ids.add(h.id);
  for (const r of vectorRows) ids.add(r.doc_id);

  const alpha = prefs.hybridAlpha;
  const scored: Array<{ id: number; score: number }> = [];
  for (const id of ids) {
    const fts = ftsById.get(id);
    const ftsNorm = fts ? 1 - (fts.rank - minRank) / rankSpan : 0;
    const vr = vectorRows.find((r) => r.doc_id === id);
    const vecNorm = vr && maxDist > 0 ? 1 - vr.distance / maxDist : vr ? 1 : 0;
    scored.push({ id, score: alpha * ftsNorm + (1 - alpha) * vecNorm });
  }
  scored.sort((a, b) => b.score - a.score);

  const out: HermesMemorySearchHit[] = [];
  for (const s of scored.slice(0, limit)) {
    const hit = ftsById.get(s.id);
    if (hit) {
      out.push(hit);
      continue;
    }
    const row = db
      .prepare(
        `SELECT id, source_kind, source_path, skill_name, title, abstract, overview,
                substr(body, 1, 240) AS snippet
         FROM memory_docs WHERE id = ?`
      )
      .get(s.id) as HermesMemorySearchHit | undefined;
    if (!row) continue;
    out.push({ ...row, rank: 0, snippet: String((row as { snippet?: string }).snippet ?? '') });
  }
  return out.length ? out : ftsHits.slice(0, limit);
}
