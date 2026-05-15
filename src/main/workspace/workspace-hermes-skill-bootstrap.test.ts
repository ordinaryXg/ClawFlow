import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { workspaceBlobDirAbs } from './workspace-blob-store';
import { workspaceSkillsDirAbs } from './workspace-agent-layout';
import { ensureWorkspaceSkillCreatorHermesSkill, WORKSPACE_SKILL_CREATOR_HERMES_SKILL_MD } from './workspace-hermes-skill-bootstrap';
import { listWorkspaceHermesSkills } from './workspace-skills-read';

describe('workspace-hermes-skill-bootstrap', () => {
  let dir: string;
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-hermes-boot-'));
  });

  afterEach(() => {
    warnSpy.mockRestore();
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

  it('creates skill-creator when other skills already exist', async () => {
    fs.mkdirSync(path.join(workspaceSkillsDirAbs(dir), 'alpha'), { recursive: true });
    fs.writeFileSync(path.join(workspaceSkillsDirAbs(dir), 'alpha', 'SKILL.md'), '# A\n', 'utf8');
    const r = await ensureWorkspaceSkillCreatorHermesSkill(dir);
    expect(r.created.length).toBe(1);
    expect(r.created[0]).toBe(WORKSPACE_SKILL_CREATOR_HERMES_SKILL_MD);
    const md = fs.readFileSync(path.join(workspaceSkillsDirAbs(dir), 'skill-creator', 'SKILL.md'), 'utf8');
    expect(md).toContain('skill-creator');
    const list = listWorkspaceHermesSkills(dir);
    expect(list.some((s) => s.name === 'skill-creator')).toBe(true);
  });

  it('skill-creator second call is no-op', async () => {
    const r1 = await ensureWorkspaceSkillCreatorHermesSkill(dir);
    expect(r1.created.length).toBe(1);
    const r2 = await ensureWorkspaceSkillCreatorHermesSkill(dir);
    expect(r2.created.length).toBe(0);
  });
});
