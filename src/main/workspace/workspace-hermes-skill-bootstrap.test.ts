import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { workspaceBlobDirAbs } from './workspace-blob-store';
import { workspaceSkillsDirAbs } from './workspace-agent-layout';
import {
  installWorkspaceSkillCreatorPackage,
  WORKSPACE_SKILL_CREATOR_HERMES_SKILL_MD,
} from './workspace-hermes-skill-bootstrap';
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

  it('installs full skill-creator v2 package on new workspace', async () => {
    fs.mkdirSync(path.join(workspaceSkillsDirAbs(dir), 'alpha'), { recursive: true });
    fs.writeFileSync(path.join(workspaceSkillsDirAbs(dir), 'alpha', 'SKILL.md'), '# A\n', 'utf8');
    const r = await installWorkspaceSkillCreatorPackage(dir);
    expect(r.created.length).toBeGreaterThanOrEqual(5);
    expect(r.created).toContain(WORKSPACE_SKILL_CREATOR_HERMES_SKILL_MD);
    const sc = path.join(workspaceSkillsDirAbs(dir), 'skill-creator');
    expect(fs.existsSync(path.join(sc, '_meta.json'))).toBe(true);
    expect(fs.existsSync(path.join(sc, 'templates', 'SKILL.md.template'))).toBe(true);
    expect(fs.existsSync(path.join(sc, 'scripts', 'validate_skill.py'))).toBe(true);
    const md = fs.readFileSync(path.join(sc, 'SKILL.md'), 'utf8');
    expect(md).toContain('skill-creator');
    const list = listWorkspaceHermesSkills(dir);
    expect(list.some((s) => s.name === 'skill-creator')).toBe(true);
  });

  it('second install is no-op', async () => {
    const r1 = await installWorkspaceSkillCreatorPackage(dir);
    expect(r1.created.length).toBeGreaterThanOrEqual(5);
    const r2 = await installWorkspaceSkillCreatorPackage(dir);
    expect(r2.created.length).toBe(0);
  });

  it('installs into existing empty skill-creator directory', async () => {
    const scRoot = path.join(workspaceSkillsDirAbs(dir), 'skill-creator');
    fs.mkdirSync(scRoot, { recursive: true });
    const r = await installWorkspaceSkillCreatorPackage(dir);
    expect(r.created.length).toBeGreaterThanOrEqual(5);
    expect(fs.existsSync(path.join(scRoot, 'SKILL.md'))).toBe(true);
  });

  it('skips install when skill-creator directory already exists (no v1 backfill)', async () => {
    const scRoot = path.join(workspaceSkillsDirAbs(dir), 'skill-creator');
    fs.mkdirSync(scRoot, { recursive: true });
    fs.writeFileSync(path.join(scRoot, 'SKILL.md'), '# legacy v1 only\n', 'utf8');
    const r = await installWorkspaceSkillCreatorPackage(dir);
    expect(r.created).not.toContain(WORKSPACE_SKILL_CREATOR_HERMES_SKILL_MD);
    expect(fs.existsSync(path.join(scRoot, '_meta.json'))).toBe(false);
    expect(fs.existsSync(path.join(scRoot, 'scripts', 'validate_skill.py'))).toBe(false);
  });
});
