import { assertValidSkillFolderName, guardHermesSkillTextContent } from '../tool-runtime/skills-guard';

describe('skills-guard', () => {
  it('rejects script tag', () => {
    const r = guardHermesSkillTextContent('hi <script>alert(1)</script>');
    expect(r.ok).toBe(false);
  });

  it('allows normal markdown', () => {
    const r = guardHermesSkillTextContent('# Title\n\nBody');
    expect(r.ok).toBe(true);
  });

  it('validates folder names', () => {
    expect(assertValidSkillFolderName('my-skill').ok).toBe(true);
    expect(assertValidSkillFolderName('../x').ok).toBe(false);
    expect(assertValidSkillFolderName('bad/name').ok).toBe(false);
  });
});
