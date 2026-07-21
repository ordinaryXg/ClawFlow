/**
 * Hermes 工作区 skill-creator v2 包：仅在**新建工作区**（尚无 `.agent/`）时整包写入。
 * 结构：SKILL.md + _meta.json + templates/ + examples/ + scripts/（对齐 WorkBuddy skills-creator）。
 */

import * as fs from 'fs';
import * as path from 'path';
import { refreshHermesMemoryIndexBestEffort } from '../../engine/hermes/hermes-memory-index-hooks';
import { syncWorkspaceSkillManifest } from './workspace-skill-manifest';
import { SKILL_CREATOR_PACKAGE_VERSION, SKILL_CREATOR_TEMPLATE_FILES } from './skill-creator-template-bundle';
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
 * 新建工作区时安装 skill-creator v2 整包（各文件 wx，不覆盖已存在路径）。
 * 既有工作区（已有 `.agent/`）不调用，不做 v1 单文件或缺文件补写。
 */
async function workspaceSkillCreatorSkillMdExists(workspaceRoot: string): Promise<boolean> {
  const skillMd = path.join(workspaceSkillsDirAbs(workspaceRoot), 'skill-creator', 'SKILL.md');
  try {
    const st = await fs.promises.stat(skillMd);
    return st.isFile();
  } catch {
    return false;
  }
}

export async function installWorkspaceSkillCreatorPackage(workspaceRoot: string): Promise<{ created: string[] }> {
  const root = path.resolve(workspaceRoot);
  const skillCreatorRoot = path.join(workspaceSkillsDirAbs(root), 'skill-creator');
  if (await workspaceSkillCreatorSkillMdExists(root)) {
    return { created: [] };
  }

  await fs.promises.mkdir(skillCreatorRoot, { recursive: true });

  const created: string[] = [];

  for (const file of SKILL_CREATOR_TEMPLATE_FILES) {
    const abs = path.join(skillCreatorRoot, ...file.rel.split('/'));
    await fs.promises.mkdir(path.dirname(abs), { recursive: true });
    const relPosix = `${WORKSPACE_SKILL_CREATOR_HERMES_SKILL_DIR}/${file.rel}`.replace(/\\/g, '/');
    if (await writeFileIfMissing(abs, file.content)) {
      created.push(relPosix);
    }
  }

  if (created.length) {
    refreshHermesMemoryIndexBestEffort(root);
    void syncWorkspaceSkillManifest(root).catch(() => undefined);
  }

  return { created };
}

export { SKILL_CREATOR_PACKAGE_VERSION };
