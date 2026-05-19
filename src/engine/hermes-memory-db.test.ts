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

  it('indexes SKILL.md and references, then MATCH finds token', () => {
    const sync = syncSkillTextSourcesToMemoryDb(dir, { fullRebuild: true });
    expect(sync.ok).toBe(true);
    if (!sync.ok) return;
    expect(sync.indexed).toBeGreaterThanOrEqual(2);

    const res = searchHermesMemory(dir, { query: 'banana', limit: 10 });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.hits.some((h) => h.source_path.includes('SKILL.md'))).toBe(true);
    expect(res.hits.some((h) => h.source_path.includes('note.txt'))).toBe(true);
  });

  it('filters by skill_name', () => {
    syncSkillTextSourcesToMemoryDb(dir, { fullRebuild: true });
    const res = searchHermesMemory(dir, { query: 'banana', skillName: 'demo-skill', limit: 10 });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.hits.length).toBeGreaterThan(0);
    expect(res.hits.every((h) => h.skill_name === 'demo-skill')).toBe(true);
  });

  it('indexes .agent/.memory with L0/L1 frontmatter', () => {
    fs.mkdirSync(path.join(dir, '.agent', '.memory'), { recursive: true });
    fs.writeFileSync(
      path.join(dir, '.agent', '.memory', 'prefs.md'),
      `---
title: User prefs
abstract: Prefer TypeScript strict mode
overview: |
  Project uses pnpm and electron-forge.
---
## Details

Always run lint before commit.
`,
      'utf8'
    );
    invalidateHermesMemoryDbCache(dir);
    const sync = syncHermesTextSourcesToMemoryDb(dir, { fullRebuild: true });
    expect(sync.ok).toBe(true);
    if (!sync.ok) return;

    const res = searchHermesMemory(dir, { query: 'TypeScript strict', limit: 10 });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const hit = res.hits.find((h) => h.source_path.includes('prefs.md'));
    expect(hit).toBeDefined();
    expect(hit?.source_kind).toBe('memory_md');
    expect(hit?.abstract).toContain('TypeScript');
  });
});
