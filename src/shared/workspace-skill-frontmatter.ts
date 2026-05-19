/**
 * `.agent/.skills/<name>/SKILL.md` 的 YAML frontmatter（Hermes 技能元数据子集）。
 */

import { parseWorkspaceMemoryFrontmatterBlock } from './workspace-memory-frontmatter';

export type ParsedSkillFrontmatter = {
  name?: string;
  description?: string;
  tags: string[];
};

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---/;

function parseTagsScalar(raw: string): string[] {
  const s = raw.trim();
  if (!s) return [];
  if (s.startsWith('[') && s.endsWith(']')) {
    const inner = s.slice(1, -1).trim();
    if (!inner) return [];
    return inner
      .split(',')
      .map((x) => x.trim().replace(/^['"]|['"]$/g, ''))
      .filter(Boolean);
  }
  return s
    .split(/[,，、]/)
    .map((x) => x.trim())
    .filter(Boolean);
}

/** 在 memory 解析器基础上补充 name / description / tags */
export function parseSkillFrontmatterBlock(fm: string): ParsedSkillFrontmatter {
  const base = parseWorkspaceMemoryFrontmatterBlock(fm);
  const out: ParsedSkillFrontmatter = {
    name: base.title,
    description: base.abstract,
    tags: [],
  };
  const lines = fm.replace(/\r\n/g, '\n').split('\n');
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const m = /^([a-zA-Z_][\w-]*)\s*:\s*(.*)$/.exec(line);
    if (!m) {
      i++;
      continue;
    }
    const key = m[1].toLowerCase();
    let value = m[2];
    if (value === '|' || value === '|-') {
      const block: string[] = [];
      i++;
      while (i < lines.length) {
        const next = lines[i];
        if (next.trim() !== '' && !/^(\s{2,}|\t)/.test(next)) break;
        block.push(next.replace(/^\s{2}/, '').replace(/^\t/, ''));
        i++;
      }
      value = block.join('\n').trimEnd();
    } else {
      value = value.trim().replace(/^['"]|['"]$/g, '');
      i++;
    }
    if (key === 'name') out.name = value.trim() || undefined;
    else if (key === 'description') out.description = value.trim() || undefined;
    else if (key === 'tags') out.tags = parseTagsScalar(value);
  }
  return out;
}

export function parseSkillMarkdown(raw: string): ParsedSkillFrontmatter {
  const text = String(raw ?? '');
  const m = FRONTMATTER_RE.exec(text);
  if (!m) return { tags: [] };
  return parseSkillFrontmatterBlock(m[1]);
}
