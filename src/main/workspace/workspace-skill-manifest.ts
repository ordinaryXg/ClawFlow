/**
 * 同步 / 读取 `.agent/.skills/skillManifest.json`（与 listWorkspaceHermesSkills 两层扫描一致）。
 */

import * as fs from 'fs';
import * as path from 'path';
import { parseSkillMarkdown } from '../../shared/workspace-skill-frontmatter';
import type { WorkspaceSkillManifestEntry, WorkspaceSkillManifestFile } from '../../shared/workspace-skill-manifest';
import {
  buildSkillManifestSystemSection,
  WORKSPACE_SKILL_MANIFEST_REL,
  WORKSPACE_SKILL_MANIFEST_VERSION,
} from '../../shared/workspace-skill-manifest';
import { listWorkspaceHermesSkills } from './workspace-skills-read';
import { readDisabledSkillRootsSync } from './workspace-skills-ui-state';
import { workspaceSkillsDirAbs, workspaceToolDirAbs } from './workspace-agent-layout';
import { resolvePathInsideWorkspace } from './workspace-explorer';

function normRoot(rel: string): string {
  return String(rel ?? '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\/+/, '');
}

function manifestPathCandidates(workspaceRoot: string): string[] {
  return [
    path.join(workspaceSkillsDirAbs(workspaceRoot), 'skillManifest.json'),
    path.join(workspaceToolDirAbs(workspaceRoot), 'skillManifest.json'),
  ];
}

function manifestWritePath(workspaceRoot: string): string {
  return manifestPathCandidates(workspaceRoot)[0];
}

function entryFromSkill(
  workspaceRoot: string,
  skill: { name: string; skillRootRel: string; skillMdRel: string }
): WorkspaceSkillManifestEntry {
  let summary = '';
  let keywords: string[] = [];
  let displayName = skill.name;
  try {
    const abs = resolvePathInsideWorkspace(workspaceRoot, skill.skillMdRel);
    const raw = fs.readFileSync(abs, 'utf8');
    const fm = parseSkillMarkdown(raw);
    if (fm.name?.trim()) displayName = fm.name.trim();
    summary = fm.description?.trim() ?? '';
    keywords = [...fm.tags];
  } catch {
    /* use defaults */
  }
  return {
    name: displayName,
    summary,
    keywords,
    skillRootRel: normRoot(skill.skillRootRel),
  };
}

/** 根据磁盘技能目录重建 skillManifest.json（仅含 UI 未禁用的技能） */
export async function syncWorkspaceSkillManifest(workspaceRoot: string): Promise<WorkspaceSkillManifestFile> {
  const root = path.resolve(workspaceRoot);
  const disabled = readDisabledSkillRootsSync(root);
  const items = listWorkspaceHermesSkills(root).filter((s) => !disabled.has(normRoot(s.skillRootRel)));
  const skills = items.map((s) => entryFromSkill(root, s));
  const body: WorkspaceSkillManifestFile = {
    version: WORKSPACE_SKILL_MANIFEST_VERSION,
    updatedAt: Date.now(),
    skills,
  };
  const fp = manifestWritePath(root);
  await fs.promises.mkdir(path.dirname(fp), { recursive: true });
  await fs.promises.writeFile(fp, JSON.stringify(body, null, 2), 'utf-8');
  return body;
}

export async function readWorkspaceSkillManifest(workspaceRoot: string): Promise<WorkspaceSkillManifestFile | null> {
  for (const fp of manifestPathCandidates(workspaceRoot)) {
    try {
      const buf = await fs.promises.readFile(fp, 'utf-8');
    const j = JSON.parse(buf) as Partial<WorkspaceSkillManifestFile>;
    if (!j || typeof j !== 'object' || !Array.isArray(j.skills)) continue;
    const skills: WorkspaceSkillManifestEntry[] = j.skills
      .map((row) => {
        if (!row || typeof row !== 'object') return null;
        const name = String((row as WorkspaceSkillManifestEntry).name ?? '').trim();
        const skillRootRel = normRoot(String((row as WorkspaceSkillManifestEntry).skillRootRel ?? ''));
        if (!name || !skillRootRel) return null;
        const keywordsRaw = (row as WorkspaceSkillManifestEntry).keywords;
        const keywords = Array.isArray(keywordsRaw)
          ? keywordsRaw.map((k) => String(k).trim()).filter(Boolean)
          : [];
        return {
          name,
          summary: String((row as WorkspaceSkillManifestEntry).summary ?? '').trim(),
          keywords,
          skillRootRel,
        };
      })
      .filter(Boolean) as WorkspaceSkillManifestEntry[];
      return {
        version: WORKSPACE_SKILL_MANIFEST_VERSION,
        updatedAt: typeof j.updatedAt === 'number' ? j.updatedAt : 0,
        skills,
      };
    } catch {
      /* try next path */
    }
  }
  return null;
}

export async function buildSkillManifestSystemContent(workspaceRoot: string): Promise<string> {
  let file = await readWorkspaceSkillManifest(workspaceRoot);
  if (!file) {
    file = await syncWorkspaceSkillManifest(workspaceRoot);
  }
  return buildSkillManifestSystemSection(file.skills);
}

export { WORKSPACE_SKILL_MANIFEST_REL };
