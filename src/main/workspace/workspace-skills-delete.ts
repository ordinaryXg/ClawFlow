/**
 * 删除整棵 Hermes 技能目录（须位于工作区 `.agent/.skills` 下）。
 */

import * as fs from 'fs';
import * as path from 'path';
import { resolvePathInsideWorkspace } from './workspace-explorer';
import { WORKSPACE_AGENT_SKILLS_REL } from './workspace-agent-layout';

export async function deleteHermesSkillDirectory(workspaceRoot: string, skillRootRel: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const root = path.resolve(workspaceRoot);
  const rel = String(skillRootRel ?? '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\/+/, '');
  if (!rel) return { ok: false, error: 'missing path' };
  let skillsBase: string;
  let targetAbs: string;
  try {
    skillsBase = resolvePathInsideWorkspace(root, WORKSPACE_AGENT_SKILLS_REL);
    targetAbs = resolvePathInsideWorkspace(root, rel);
  } catch {
    return { ok: false, error: 'invalid path' };
  }
  const baseNorm = path.resolve(skillsBase) + path.sep;
  const targetNorm = path.resolve(targetAbs);
  const cmpA = process.platform === 'win32' ? targetNorm.toLowerCase() : targetNorm;
  const cmpB = process.platform === 'win32' ? baseNorm.toLowerCase() : baseNorm;
  if (targetNorm === path.resolve(skillsBase)) return { ok: false, error: 'cannot delete skills root' };
  if (!cmpA.startsWith(cmpB)) return { ok: false, error: 'path must be under .agent/.skills' };
  try {
    const st = await fs.promises.stat(targetNorm);
    if (!st.isDirectory()) return { ok: false, error: 'not a directory' };
  } catch {
    return { ok: false, error: 'not found' };
  }
  try {
    await fs.promises.rm(targetNorm, { recursive: true, force: true });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
