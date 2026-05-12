/**
 * 校验模型传入的技能相对路径（POSIX 语义，允许传入反斜杠）。
 */

import * as path from 'path';
import { normalizeHermesSkillWorkspaceRel } from '../workspace-agent-layout';

export function normalizeWorkspaceRel(rel: string): string {
  return String(rel ?? '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\/+/, '');
}

/** 规范化后用于技能工具：历史 `.clawflow/skills`、`.agent/.clawflow/skills`、`.agent/skills` → `.agent/.skills` */
export function normalizeSkillWorkspaceRel(rel: string): string {
  return normalizeHermesSkillWorkspaceRel(normalizeWorkspaceRel(rel));
}

/** 可编入 FTS 的技能文档：任意深度的 SKILL.md，或任意 references/ 下 .md/.txt */
export function isSkillIndexedDocumentRel(rel: string): boolean {
  const n = normalizeSkillWorkspaceRel(rel);
  if (n !== '.agent/.skills' && !n.startsWith('.agent/.skills/')) return false;
  const base = n.split('/').pop() ?? '';
  if (base === 'SKILL.md') return true;
  if (n.includes('/references/')) {
    const ext = path.posix.extname(base).toLowerCase();
    return ext === '.md' || ext === '.txt';
  }
  return false;
}

/** 仅 references 下辅助文档（不含 SKILL.md） */
export function isSkillReferencesOnlyDocRel(rel: string): boolean {
  const n = normalizeSkillWorkspaceRel(rel);
  if (!n.startsWith('.agent/.skills/') || !n.includes('/references/')) return false;
  const base = n.split('/').pop() ?? '';
  const ext = path.posix.extname(base).toLowerCase();
  return ext === '.md' || ext === '.txt';
}
