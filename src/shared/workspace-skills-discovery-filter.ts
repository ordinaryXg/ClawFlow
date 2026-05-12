import type { WorkspaceSkillListItem } from './workspace-skills-types';

/** 与工作区 bootstrap `ensureWorkspaceDefaultHermesSkill` 创建的示例目录一致（POSIX） */
export const WORKSPACE_BOOTSTRAP_DEFAULT_SKILL_ROOT_POSIX = '.agent/.skills/default';

export function normalizeHermesSkillRootRel(rel: string): string {
  return String(rel ?? '').trim().replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '');
}

/**
 * 「已发现技能」面板展示列表：若磁盘上除引导 default 外还有其它技能，则隐藏 default，
 * 避免与右侧正文（模板语义）重复出现在同一列表。
 */
export function skillsForHermesDiscoveryUi(all: readonly WorkspaceSkillListItem[]): WorkspaceSkillListItem[] {
  const bootstrap = WORKSPACE_BOOTSTRAP_DEFAULT_SKILL_ROOT_POSIX;
  const hasOther = all.some((s) => normalizeHermesSkillRootRel(s.skillRootRel) !== bootstrap);
  if (!hasOther) return [...all];
  return all.filter((s) => normalizeHermesSkillRootRel(s.skillRootRel) !== bootstrap);
}
