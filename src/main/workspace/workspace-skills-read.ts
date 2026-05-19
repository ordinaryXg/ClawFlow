/**
 * 只读扫描 `.agent/.skills/**` 下的 Hermes 技能（Main / tool-runtime 使用）。
 */

import * as fs from 'fs';
import * as path from 'path';
import { resolvePathInsideWorkspace } from './workspace-explorer';
import type { WorkspaceSkillListItem } from '../../shared/workspace-skills-types';
import { normalizeHermesSkillWorkspaceRel, WORKSPACE_AGENT_DIR, WORKSPACE_AGENT_SKILLS_REL, workspaceAgentRootAbs } from './workspace-agent-layout';

const REF_EXT = new Set(['.md', '.txt']);
export const WORKSPACE_SKILL_VIEW_MAX_BYTES = 512 * 1024;

function toPosixRelUnderAgentTree(workspaceRoot: string, absPath: string): string {
  const agentRoot = path.resolve(workspaceAgentRootAbs(workspaceRoot));
  const ap = path.resolve(absPath);
  const rel = path.relative(agentRoot, ap);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    return path.relative(path.resolve(workspaceRoot), ap).split(path.sep).join('/');
  }
  return path.join(WORKSPACE_AGENT_DIR, rel).split(path.sep).join('/');
}

/**
 * 仅扫描 `.agent/.skills/<技能名>/SKILL.md`（两层：skills 根 + 一级子目录）。
 * 不递归 `skill-creator/examples/**` 等嵌套示例。
 */
function listTopLevelSkillMdAbsolutePaths(skillsBaseAbs: string): string[] {
  const out: string[] = [];
  let entries: fs.Dirent[];
  try {
    fs.accessSync(skillsBaseAbs);
    entries = fs.readdirSync(skillsBaseAbs, { withFileTypes: true });
  } catch {
    return [];
  }
  for (const e of entries) {
    if (!e.isDirectory() || e.name.startsWith('.')) continue;
    const skillRootAbs = path.join(skillsBaseAbs, e.name);
    const absMd = path.join(skillRootAbs, 'SKILL.md');
    try {
      const st = fs.statSync(absMd);
      if (st.isFile()) out.push(absMd);
    } catch {
      /* 非标准技能目录：无根级 SKILL.md 则跳过 */
    }
  }
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
  for (const absMd of listTopLevelSkillMdAbsolutePaths(skillsBaseAbs)) {
    const skillRootAbs = path.dirname(absMd);
    const skillRootRel = toPosixRelUnderAgentTree(root, skillRootAbs);
    const skillMdRel = toPosixRelUnderAgentTree(root, absMd);
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
            if (REF_EXT.has(ext)) referenceFiles.push({ relPath: toPosixRelUnderAgentTree(root, p) });
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
