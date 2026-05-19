import { parseWorkspaceMemoryMarkdown } from './workspace-memory-frontmatter';

describe('workspace-memory-frontmatter', () => {
  it('parses abstract, overview block, and body', () => {
    const raw = `---
title: Daily note
abstract: One line summary for search
overview: |
  Longer context
  second line
---
## Details

Full body here.
`;
    const p = parseWorkspaceMemoryMarkdown(raw);
    expect(p.title).toBe('Daily note');
    expect(p.abstract).toBe('One line summary for search');
    expect(p.overview).toContain('Longer context');
    expect(p.body).toContain('Full body here');
    expect(p.ftsBody).toContain('One line summary');
    expect(p.ftsBody).toContain('Full body here');
    expect(p.hasFrontmatter).toBe(true);
  });

  it('treats file without frontmatter as body-only', () => {
    const p = parseWorkspaceMemoryMarkdown('# Hello\n\nWorld');
    expect(p.hasFrontmatter).toBe(false);
    expect(p.ftsBody).toBe('# Hello\n\nWorld');
  });
});
