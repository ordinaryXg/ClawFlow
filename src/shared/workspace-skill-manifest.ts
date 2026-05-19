/** `.agent/.tool/skillManifest.json` — 工作区 Hermes 技能名册（供主对话 system 注入） */

export const WORKSPACE_SKILL_MANIFEST_VERSION = 1 as const;
export const WORKSPACE_SKILL_MANIFEST_REL = '.agent/.tool/skillManifest.json';

export type WorkspaceSkillManifestEntry = {
  /** 展示名（frontmatter `name` 或目录名） */
  name: string;
  /** 简要作用（frontmatter `description`） */
  summary: string;
  /** 触发/检索关键字（frontmatter `tags` 等） */
  keywords: string[];
  /** 技能根目录，相对工作区根，POSIX */
  skillRootRel: string;
};

export type WorkspaceSkillManifestFile = {
  version: typeof WORKSPACE_SKILL_MANIFEST_VERSION;
  updatedAt: number;
  skills: WorkspaceSkillManifestEntry[];
};

export function buildSkillManifestSystemSection(entries: readonly WorkspaceSkillManifestEntry[]): string {
  if (!entries.length) {
    return [
      '【工作区 Hermes 技能名册】',
      '当前无已登记技能（`.agent/.skills/<名称>/SKILL.md` 一层目录）。',
      '可用 `workspace_skill_list` / `workspace_skill_view` 浏览；创建技能见 `workspace_skill_create`。',
    ].join('\n');
  }
  const lines: string[] = [
    '【工作区 Hermes 技能名册】',
    '下列为当前工作区已启用技能的摘要（完整正文请用 `workspace_skill_view` 或记忆检索）。',
    '',
  ];
  entries.forEach((e, idx) => {
    const kw = e.keywords.length ? e.keywords.join('、') : '—';
    lines.push(`${idx + 1}. **${e.name}** — ${e.summary || '（无简介）'}`);
    lines.push(`   - 路径：\`${e.skillRootRel}\``);
    lines.push(`   - 关键字：${kw}`);
    lines.push('');
  });
  return lines.join('\n').trimEnd();
}
