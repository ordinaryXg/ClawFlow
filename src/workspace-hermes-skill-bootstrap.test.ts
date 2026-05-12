import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ensureWorkspaceDefaultHermesSkill, WORKSPACE_DEFAULT_HERMES_SKILL_MD } from './workspace-hermes-skill-bootstrap';
import { listWorkspaceHermesSkills } from './workspace-skills-read';

describe('workspace-hermes-skill-bootstrap', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-hermes-boot-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('creates default skill when skills tree is empty', async () => {
    const r1 = await ensureWorkspaceDefaultHermesSkill(dir);
    expect(r1.created.length).toBe(1);
    expect(r1.created[0]).toBe(WORKSPACE_DEFAULT_HERMES_SKILL_MD);
    const list = listWorkspaceHermesSkills(dir);
    expect(list.some((s) => s.name === 'default')).toBe(true);
    const md = fs.readFileSync(path.join(dir, '.agent', 'skills', 'default', 'SKILL.md'), 'utf8');
    expect(md).toContain('default');
  });

  it('does not duplicate when skills already exist', async () => {
    fs.mkdirSync(path.join(dir, '.agent', 'skills', 'alpha'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.agent', 'skills', 'alpha', 'SKILL.md'), '# A\n', 'utf8');
    const r = await ensureWorkspaceDefaultHermesSkill(dir);
    expect(r.created.length).toBe(0);
    expect(fs.existsSync(path.join(dir, '.agent', 'skills', 'default', 'SKILL.md'))).toBe(false);
  });

  it('second call is no-op after default exists', async () => {
    await ensureWorkspaceDefaultHermesSkill(dir);
    const r2 = await ensureWorkspaceDefaultHermesSkill(dir);
    expect(r2.created.length).toBe(0);
  });
});
