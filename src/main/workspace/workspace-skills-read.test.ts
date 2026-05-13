import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { workspaceBlobDirAbs } from './workspace-blob-store';
import { workspaceSkillsDirAbs } from './workspace-agent-layout';
import { listWorkspaceHermesSkills, readWorkspaceSkillTextFile } from './workspace-skills-read';

describe('workspace-skills-read', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-ws-skills-'));
    const skills = workspaceSkillsDirAbs(dir);
    fs.mkdirSync(path.join(skills, 'alpha'), { recursive: true });
    fs.writeFileSync(path.join(skills, 'alpha', 'SKILL.md'), '# Alpha\n', 'utf8');
    fs.mkdirSync(path.join(skills, 'alpha', 'references'), { recursive: true });
    fs.writeFileSync(path.join(skills, 'alpha', 'references', 'r.txt'), 'hello', 'utf8');
  });

  afterEach(() => {
    try {
      fs.rmSync(path.join(dir, '.agent'), { recursive: true, force: true });
    } catch {
      /* ignore */
    }
    try {
      fs.rmSync(path.join(dir, '.subagent'), { recursive: true, force: true });
    } catch {
      /* ignore */
    }
    try {
      fs.rmSync(workspaceBlobDirAbs(dir), { recursive: true, force: true });
    } catch {
      /* ignore */
    }
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('lists skill roots and references', () => {
    const list = listWorkspaceHermesSkills(dir);
    expect(list.length).toBe(1);
    expect(list[0].name).toBe('alpha');
    expect(list[0].referenceFiles.some((r) => r.relPath.endsWith('r.txt'))).toBe(true);
  });

  it('rejects paths outside skills tree', () => {
    const bad = readWorkspaceSkillTextFile(dir, '.agent/.clawflow/workspace.json');
    expect(bad.ok).toBe(false);
  });

  it('reads SKILL.md under skills', () => {
    const r = readWorkspaceSkillTextFile(dir, '.agent/.skills/alpha/SKILL.md');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.content).toContain('Alpha');
  });

  it('accepts legacy .clawflow/skills path for read after normalize', () => {
    const r = readWorkspaceSkillTextFile(dir, '.clawflow/skills/alpha/SKILL.md');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.content).toContain('Alpha');
  });

  it('accepts legacy .agent/skills path for read after normalize', () => {
    const r = readWorkspaceSkillTextFile(dir, '.agent/skills/alpha/SKILL.md');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.content).toContain('Alpha');
  });
});
