/** Hermes 工作区技能（`.agent/.skills`）列表项；渲染进程与 Main 共用 */

export type WorkspaceSkillListItem = {
  /** 含 SKILL.md 的技能目录，相对工作区根，POSIX */
  skillRootRel: string;
  /** 展示名：目录 basename */
  name: string;
  /** SKILL.md 相对路径 */
  skillMdRel: string;
  /** `references/` 下可预览的 .md / .txt */
  referenceFiles: Array<{ relPath: string }>;
};
