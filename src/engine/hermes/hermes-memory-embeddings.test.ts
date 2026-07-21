import { getHermesVectorIndexStatus, mergeHybridHermesHits, type HermesVecDb } from './hermes-memory-embeddings';
import type { HermesMemorySearchHit } from './hermes-memory-db';

jest.mock('../../main/prefs/hermes-embedding-prefs', () => ({
  resolveHermesEmbeddingPrefs: () => ({
    enabled: false,
    provider: 'ollama',
    baseUrl: 'http://127.0.0.1:11434',
    apiKey: '',
    model: 'nomic-embed-text',
    hybridAlpha: 0.55,
    dimensions: 768,
  }),
}));

describe('hermes-memory-embeddings', () => {
  it('getHermesVectorIndexStatus reports disabled hybrid when prefs off', () => {
    const db = {
      prepare: (sql: string) => ({
        run: () => ({ changes: 0 }),
        all: () => [],
        get: () => {
          if (sql.includes('memory_docs')) return { c: 3 };
          if (sql.includes('memory_vec')) return { c: 0 };
          return undefined;
        },
      }),
      exec: () => undefined,
      transaction: (fn: (rows: unknown) => void) => (rows: unknown) => fn(rows),
    } as HermesVecDb;

    const status = getHermesVectorIndexStatus(db);
    expect(status.enabled).toBe(false);
    expect(status.docCount).toBe(3);
    expect(status.hybridReady).toBe(false);
  });

  it('mergeHybridHermesHits falls back to FTS when hybrid disabled', async () => {
    const hits: HermesMemorySearchHit[] = [
      {
        id: 1,
        source_kind: 'knowledge_md',
        source_path: '.agent/.knowledge/notes/a.md',
        skill_name: null,
        title: 'A',
        abstract: null,
        overview: null,
        snippet: 'hello',
        rank: -1,
      },
    ];
    const db = {
      prepare: () => ({ run: () => ({ changes: 0 }), all: () => [], get: () => undefined }),
      exec: () => undefined,
      transaction: (fn: (rows: unknown) => void) => (rows: unknown) => fn(rows),
    } as HermesVecDb;

    const merged = await mergeHybridHermesHits(db, hits, 'hello', 5);
    expect(merged.hybridUsed).toBe(false);
    expect(merged.hits).toHaveLength(1);
    expect(merged.hits[0]?.source_path).toContain('knowledge');
  });
});
