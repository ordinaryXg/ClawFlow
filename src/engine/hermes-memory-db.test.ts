import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  invalidateHermesMemoryDbCache,
  searchHermesMemory,
  syncHermesTextSourcesToMemoryDb,
  syncSkillTextSourcesToMemoryDb,
} from './hermes-memory-db';

function canLoadSqlite(): boolean {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const BetterSqlite = require('better-sqlite3');
    const db = new BetterSqlite(':memory:');
    db.close();
    return true;
  } catch {
    return false;
  }
}

const run = canLoadSqlite() ? describe : describe.skip;

run('hermes-memory-db FTS5', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-hermes-'));
    fs.mkdirSync(path.join(dir, '.agent', '.skills', 'demo-skill'), { recursive: true });
    fs.writeFileSync(
      path.join(dir, '.agent', '.skills', 'demo-skill', 'SKILL.md'),
      '# Demo\n\nHello Hermes FTS banana search test.\n',
      'utf8'
    );
    fs.mkdirSync(path.join(dir, '.agent', '.skills', 'demo-skill', 'references'), { recursive: true });
    fs.writeFileSync(
      path.join(dir, '.agent', '.skills', 'demo-skill', 'references', 'note.txt'),
      'Banana pudding recipe notes.',
      'utf8'
    );
    invalidateHermesMemoryDbCache(dir);
  });

  afterEach(() => {
    invalidateHermesMemoryDbCache(dir);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('indexes SKILL.md and references, then MATCH finds token', async () => {
    const sync = syncSkillTextSourcesToMemoryDb(dir, { fullRebuild: true });
    expect(sync.ok).toBe(true);
    if (!sync.ok) return;
    expect(sync.indexed).toBeGreaterThanOrEqual(2);

    const res = await searchHermesMemory(dir, { query: 'banana', limit: 10 });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.hits.some((h) => h.source_path.includes('SKILL.md'))).toBe(true);
    expect(res.hits.some((h) => h.source_path.includes('note.txt'))).toBe(true);
  });

  it('filters by skill_name', async () => {
    syncSkillTextSourcesToMemoryDb(dir, { fullRebuild: true });
    const res = await searchHermesMemory(dir, { query: 'banana', skillName: 'demo-skill', limit: 10 });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.hits.length).toBeGreaterThan(0);
    expect(res.hits.every((h) => h.skill_name === 'demo-skill')).toBe(true);
  });

  it('indexes hermes_memory via upsert with L0/L1', async () => {
    const { upsertHermesMemoryDocument } = await import('./hermes-memory-store');
    const up = upsertHermesMemoryDocument(dir, {
      relativePath: '.agent/.hermes/memory/prefs.md',
      title: 'User prefs',
      abstract: 'Prefer TypeScript strict mode',
      overview: 'Project uses pnpm and electron-forge.',
      body: '## Details\n\nAlways run lint before commit.',
    });
    expect(up.ok).toBe(true);
    invalidateHermesMemoryDbCache(dir);

    const res = await searchHermesMemory(dir, { query: 'TypeScript strict', limit: 10 });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const hit = res.hits.find((h) => h.source_path.includes('prefs.md'));
    expect(hit).toBeDefined();
    expect(hit?.source_kind).toBe('hermes_memory');
    expect(hit?.abstract).toContain('TypeScript');
  });

  it('indexes .agent/.knowledge markdown', async () => {
    fs.mkdirSync(path.join(dir, '.agent', '.knowledge', 'notes'), { recursive: true });
    fs.writeFileSync(
      path.join(dir, '.agent', '.knowledge', 'notes', 'ref.md'),
      `---
title: API ref
abstract: Workspace knowledge FTS test phrase
---
Body here.
`,
      'utf8'
    );
    invalidateHermesMemoryDbCache(dir);
    const sync = syncHermesTextSourcesToMemoryDb(dir, { fullRebuild: true });
    expect(sync.ok).toBe(true);
    if (!sync.ok) return;

    const res = await searchHermesMemory(dir, { query: 'knowledge FTS test', limit: 10 });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const hit = res.hits.find((h) => h.source_path.includes('ref.md'));
    expect(hit).toBeDefined();
    expect(hit?.source_kind).toBe('knowledge_md');
  });
});
