import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { workspaceBlobDirAbs } from './workspace-blob-store';
import { workspaceSkillsDirAbs } from './workspace-agent-layout';
import { ensureWorkspaceDefaultHermesSkill, WORKSPACE_DEFAULT_HERMES_SKILL_MD } from './workspace-hermes-skill-bootstrap';
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

  it('creates default skill when skills tree is empty', async () => {
    const r1 = await ensureWorkspaceDefaultHermesSkill(dir);
    expect(r1.created.length).toBe(1);
    expect(r1.created[0]).toBe(WORKSPACE_DEFAULT_HERMES_SKILL_MD);
    const list = listWorkspaceHermesSkills(dir);
    expect(list.some((s) => s.name === 'default')).toBe(true);
    const md = fs.readFileSync(path.join(workspaceSkillsDirAbs(dir), 'default', 'SKILL.md'), 'utf8');
    expect(md).toContain('default');
  });

  it('does not duplicate when skills already exist', async () => {
    fs.mkdirSync(path.join(workspaceSkillsDirAbs(dir), 'alpha'), { recursive: true });
    fs.writeFileSync(path.join(workspaceSkillsDirAbs(dir), 'alpha', 'SKILL.md'), '# A\n', 'utf8');
    const r = await ensureWorkspaceDefaultHermesSkill(dir);
    expect(r.created.length).toBe(0);
    expect(fs.existsSync(path.join(workspaceSkillsDirAbs(dir), 'default', 'SKILL.md'))).toBe(false);
  });

  it('second call is no-op after default exists', async () => {
    await ensureWorkspaceDefaultHermesSkill(dir);
    const r2 = await ensureWorkspaceDefaultHermesSkill(dir);
    expect(r2.created.length).toBe(0);
  });
});
