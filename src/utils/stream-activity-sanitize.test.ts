import {
  pickRunningToolHints,
  sanitizeStreamActivityForDisplay,
  stripTrailingIncompleteJson,
} from './stream-activity-sanitize';

describe('stream-activity-sanitize', () => {
  it('strips trailing incomplete JSON object', () => {
    expect(stripTrailingIncompleteJson('hello {"domain": "docs"')).toBe('hello');
  });

  it('keeps complete JSON when not at end-only tool block context', () => {
    const full = '{"a":1} tail';
    expect(stripTrailingIncompleteJson(full)).toBe(full);
  });

  it('removes tool markers and json summary from activity', () => {
    const raw = '分析中\n[tool:start] workspace_list_dir\n[tool:done] workspace_list_dir\n{"ok":true}\n继续';
    const out = sanitizeStreamActivityForDisplay(raw);
    expect(out.text).toContain('分析中');
    expect(out.text).toContain('继续');
    expect(out.text).not.toContain('[tool:');
    expect(out.text).not.toContain('"ok"');
  });

  it('suppresses streaming tool argument json', () => {
    const raw = '{"domain":"docs","args":["+fetch"';
    const out = sanitizeStreamActivityForDisplay(raw);
    expect(out.text).toBe('');
  });

  it('pickRunningToolHints returns tools still running', () => {
    const hints = pickRunningToolHints([
      { name: 'workspace_read_file', phase: 'start' },
      { name: 'web_search', phase: 'start' },
      { name: 'web_search', phase: 'done' },
    ]);
    expect(hints.map((h) => h.name)).toEqual(['workspace_read_file']);
  });
});
