import { parseSkillMarkdown } from './workspace-skill-frontmatter';

describe('parseSkillMarkdown', () => {
  it('parses name description and tags', () => {
    const raw = `---
name: demo-skill
description: 用于测试的示例技能
tags: [hello, 测试]
---
# Body
`;
    const fm = parseSkillMarkdown(raw);
    expect(fm.name).toBe('demo-skill');
    expect(fm.description).toContain('测试');
    expect(fm.tags).toEqual(expect.arrayContaining(['hello', '测试']));
  });
});
