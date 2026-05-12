/**
 * 只读扫描 `.agent/.skills/**` 下的 Hermes 技能（Main / tool-runtime 使用）。
 */

import * as fs from 'fs';
import * as path from 'path';
import { resolvePathInsideWorkspace } from './workspace-explorer';
import type { WorkspaceSkillListItem } from './shared/workspace-skills-types';
import { normalizeHermesSkillWorkspaceRel, WORKSPACE_AGENT_SKILLS_REL } from './workspace-agent-layout';

const REF_EXT = new Set(['.md', '.txt']);
export const WORKSPACE_SKILL_VIEW_MAX_BYTES = 512 * 1024;

function toPosixRel(workspaceRoot: string, absPath: string): string {
  return path.relative(path.resolve(workspaceRoot), absPath).split(path.sep).join('/');
}

function listSkillMdAbsolutePaths(skillsBaseAbs: string): string[] {
  const out: string[] = [];
  function walk(dir: string): void {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const abs = path.join(dir, e.name);
      if (e.isDirectory()) walk(abs);
      else if (e.isFile() && e.name === 'SKILL.md') out.push(abs);
    }
  }
  try {
    fs.accessSync(skillsBaseAbs);
  } catch {
    return [];
  }
  walk(skillsBaseAbs);
  return out;
}

export function listWorkspaceHermesSkills(workspaceRoot: string): WorkspaceSkillListItem[] {
  const root = path.resolve(workspaceRoot);
  let skillsBaseAbs: string;
  try {
    skillsBaseAbs = resolvePathInsideWorkspace(root, WORKSPACE_AGENT_SKILLS_REL);
  } catch {
    return [];
  }

  const items: WorkspaceSkillListItem[] = [];
  for (const absMd of listSkillMdAbsolutePaths(skillsBaseAbs)) {
    const skillRootAbs = path.dirname(absMd);
    const skillRootRel = toPosixRel(root, skillRootAbs);
    const skillMdRel = toPosixRel(root, absMd);
    const name = path.basename(skillRootAbs);
    const referenceFiles: Array<{ relPath: string }> = [];
    const refDir = path.join(skillRootAbs, 'references');
    try {
      const st = fs.statSync(refDir);
      if (st.isDirectory()) {
        for (const n of fs.readdirSync(refDir)) {
          const p = path.join(refDir, n);
          try {
            if (!fs.statSync(p).isFile()) continue;
            const ext = path.extname(n).toLowerCase();
            if (REF_EXT.has(ext)) referenceFiles.push({ relPath: toPosixRel(root, p) });
          } catch {
            /* ignore */
          }
        }
        referenceFiles.sort((a, b) => a.relPath.localeCompare(b.relPath, undefined, { sensitivity: 'base' }));
      }
    } catch {
      /* no references */
    }
    items.push({ skillRootRel, name, skillMdRel, referenceFiles });
  }
  items.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  return items;
}

function isUnderSkillsTree(skillsRootResolved: string, fileResolved: string): boolean {
  const sr = path.resolve(skillsRootResolved);
  const f = path.resolve(fileResolved);
  if (f === sr) return false;
  const prefix = sr.endsWith(path.sep) ? sr : sr + path.sep;
  const cmpA = process.platform === 'win32' ? f.toLowerCase() : f;
  const cmpB = process.platform === 'win32' ? prefix.toLowerCase() : prefix;
  return cmpA.startsWith(cmpB);
}

/**
 * 读取技能树内文本：SKILL.md 或 references 下 .md / .txt；路径须已解析在工作区内且位于 `.agent/.skills`（兼容历史 `.agent/skills`、`.clawflow/skills` 前缀）。
 */
export function readWorkspaceSkillTextFile(
  workspaceRoot: string,
  relativePath: string
): { ok: true; content: string } | { ok: false; error: string } {
  let full: string;
  try {
    const normalizedRel = normalizeHermesSkillWorkspaceRel(
      String(relativePath ?? '')
        .trim()
        .replace(/\\/g, '/')
        .replace(/^\/+/, '')
    );
    full = resolvePathInsideWorkspace(workspaceRoot, normalizedRel);
  } catch {
    return { ok: false, error: 'Invalid path' };
  }
  let skillsRoot: string;
  try {
    skillsRoot = resolvePathInsideWorkspace(workspaceRoot, WORKSPACE_AGENT_SKILLS_REL);
  } catch {
    return { ok: false, error: 'Skills directory not found' };
  }
  if (!isUnderSkillsTree(skillsRoot, full)) {
    return { ok: false, error: 'Path must be under .agent/.skills' };
  }
  const base = path.basename(full);
  const ext = path.extname(full).toLowerCase();
  if (base !== 'SKILL.md' && !REF_EXT.has(ext)) {
    return { ok: false, error: 'Only SKILL.md and .md/.txt files can be viewed' };
  }
  try {
    const st = fs.statSync(full);
    if (!st.isFile()) return { ok: false, error: 'Not a file' };
    if (st.size > WORKSPACE_SKILL_VIEW_MAX_BYTES) {
      return { ok: false, error: `File too large (max ${WORKSPACE_SKILL_VIEW_MAX_BYTES} bytes)` };
    }
    return { ok: true, content: fs.readFileSync(full, 'utf8') };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
