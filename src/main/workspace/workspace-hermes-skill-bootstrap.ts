/**
 * Hermes 工作区技能：在 `.agent/.skills/` 下无任一技能时，补写默认示例 `default/SKILL.md`（flag wx，不覆盖用户已有技能）。
 */

import * as fs from 'fs';
import * as path from 'path';
import { refreshHermesSkillMemoryIndexBestEffort } from '../../engine/hermes-skill-index-hooks';
import { listWorkspaceHermesSkills } from './workspace-skills-read';
import templateDefaultSkillMd from '../../workspace-templates/hermes-skills/default/SKILL.md';
import { workspaceSkillsDirAbs } from './workspace-agent-layout';

export const WORKSPACE_DEFAULT_HERMES_SKILL_DIR = '.agent/.skills/default';
export const WORKSPACE_DEFAULT_HERMES_SKILL_MD = `${WORKSPACE_DEFAULT_HERMES_SKILL_DIR}/SKILL.md`;

async function writeFileIfMissing(filePath: string, content: string): Promise<boolean> {
  try {
    await fs.promises.writeFile(filePath, content, { encoding: 'utf-8', flag: 'wx' });
    return true;
  } catch (e: unknown) {
    const code = (e as NodeJS.ErrnoException)?.code;
    if (code === 'EEXIST') return false;
    throw e;
  }
}

/**
 * 若 `.agent/.skills/**` 下尚无任何 `SKILL.md`，则创建默认示例技能目录。
 */
export async function ensureWorkspaceDefaultHermesSkill(workspaceRoot: string): Promise<{ created: string[] }> {
  const root = path.resolve(workspaceRoot);
  const skillsBase = workspaceSkillsDirAbs(root);
  await fs.promises.mkdir(skillsBase, { recursive: true });

  const existing = listWorkspaceHermesSkills(root);
  if (existing.length > 0) {
    return { created: [] };
  }

  const relMd = WORKSPACE_DEFAULT_HERMES_SKILL_MD.replace(/\\/g, '/');
  const absMd = path.join(skillsBase, 'default', 'SKILL.md');
  await fs.promises.mkdir(path.dirname(absMd), { recursive: true });

  const body = String(templateDefaultSkillMd ?? '').trimEnd();
  const payload = body.endsWith('\n') ? body : `${body}\n`;

  const created: string[] = [];
  if (await writeFileIfMissing(absMd, payload)) {
    created.push(relMd);
  }

  if (created.length) {
    refreshHermesSkillMemoryIndexBestEffort(root);
  }

  return { created };
}
