/**
 * 内置 skill-creator 模板文件（Webpack asset/source 打入主进程）。
 */

import templateSkillMd from '../../workspace-templates/hermes-skills/skill-creator/SKILL.md';
import templateMetaJsonRaw from '../../workspace-templates/hermes-skills/skill-creator/_meta.json';
import templateSkillMdTemplate from '../../workspace-templates/hermes-skills/skill-creator/templates/SKILL.md.template';
import templateHelloSkillMd from '../../workspace-templates/hermes-skills/skill-creator/examples/hello-skill/SKILL.md';
import templateValidatePy from '../../workspace-templates/hermes-skills/skill-creator/scripts/validate_skill.py';

export type SkillCreatorTemplateFile = {
  /** 相对 `.agent/.skills/skill-creator/` */
  rel: string;
  content: string;
};

function normalizeText(s: string): string {
  const t = String(s ?? '').trimEnd();
  return t.endsWith('\n') ? t : `${t}\n`;
}

function metaJsonText(): string {
  if (typeof templateMetaJsonRaw === 'string') return templateMetaJsonRaw;
  return JSON.stringify(templateMetaJsonRaw, null, 2);
}

/** skill-creator 包版本（与 _meta.json / SKILL frontmatter 一致） */
export const SKILL_CREATOR_PACKAGE_VERSION = 2;

/** 新建工作区时一次性写入的 v2 包文件列表（顺序无关）。 */
export const SKILL_CREATOR_TEMPLATE_FILES: SkillCreatorTemplateFile[] = [
  { rel: 'SKILL.md', content: normalizeText(templateSkillMd) },
  { rel: '_meta.json', content: normalizeText(metaJsonText()) },
  { rel: 'templates/SKILL.md.template', content: normalizeText(templateSkillMdTemplate) },
  { rel: 'examples/hello-skill/SKILL.md', content: normalizeText(templateHelloSkillMd) },
  { rel: 'scripts/validate_skill.py', content: normalizeText(templateValidatePy) },
];
