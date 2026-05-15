import type { WorkspaceSkillListItem } from './workspace-skills-types';

/** 历史工作区可能存在的示例目录 `.agent/.skills/default`（POSIX），与其它技能并存时在发现列表中隐藏以免重复占位 */
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
