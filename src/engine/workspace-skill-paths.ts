/**
 * 校验模型传入的技能相对路径（POSIX 语义，允许传入反斜杠）。
 */

import * as path from 'path';

export function normalizeWorkspaceRel(rel: string): string {
  return String(rel ?? '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\/+/, '');
}

/** 可编入 FTS 的技能文档：任意深度的 SKILL.md，或任意 references/ 下 .md/.txt */
export function isSkillIndexedDocumentRel(rel: string): boolean {
  const n = normalizeWorkspaceRel(rel);
  if (n !== '.clawflow/skills' && !n.startsWith('.clawflow/skills/')) return false;
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
  const n = normalizeWorkspaceRel(rel);
  if (!n.startsWith('.clawflow/skills/') || !n.includes('/references/')) return false;
  const base = n.split('/').pop() ?? '';
  const ext = path.posix.extname(base).toLowerCase();
  return ext === '.md' || ext === '.txt';
}
