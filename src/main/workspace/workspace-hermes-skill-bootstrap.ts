/**
 * Hermes 工作区技能：打开工作区时若缺失则补写内置 `skill-creator/SKILL.md`（wx，不覆盖用户修改）。
 * 不再自动创建 `default/` 示例目录；新建技能请通过 `.agent/.skills/skill-creator` 说明与工具链完成。
 */

import * as fs from 'fs';
import * as path from 'path';
import { refreshHermesMemoryIndexBestEffort } from '../../engine/hermes-memory-index-hooks';
import templateSkillCreatorSkillMd from '../../workspace-templates/hermes-skills/skill-creator/SKILL.md';
import { workspaceSkillsDirAbs } from './workspace-agent-layout';

export const WORKSPACE_SKILL_CREATOR_HERMES_SKILL_DIR = '.agent/.skills/skill-creator';
export const WORKSPACE_SKILL_CREATOR_HERMES_SKILL_MD = `${WORKSPACE_SKILL_CREATOR_HERMES_SKILL_DIR}/SKILL.md`;

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
 * 若 `.agent/.skills/skill-creator/SKILL.md` 尚不存在则创建（与其它技能是否已存在无关）。
 */
export async function ensureWorkspaceSkillCreatorHermesSkill(workspaceRoot: string): Promise<{ created: string[] }> {
  const root = path.resolve(workspaceRoot);
  const skillsBase = workspaceSkillsDirAbs(root);
  await fs.promises.mkdir(skillsBase, { recursive: true });

  const relMd = WORKSPACE_SKILL_CREATOR_HERMES_SKILL_MD.replace(/\\/g, '/');
  const absMd = path.join(skillsBase, 'skill-creator', 'SKILL.md');
  await fs.promises.mkdir(path.dirname(absMd), { recursive: true });

  const body = String(templateSkillCreatorSkillMd ?? '').trimEnd();
  const payload = body.endsWith('\n') ? body : `${body}\n`;

  const created: string[] = [];
  if (await writeFileIfMissing(absMd, payload)) {
    created.push(relMd);
  }

  if (created.length) {
    refreshHermesMemoryIndexBestEffort(root);
  }

  return { created };
}
