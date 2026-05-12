import { isSkillIndexedDocumentRel, isSkillReferencesOnlyDocRel, normalizeWorkspaceRel } from './workspace-skill-paths';

describe('workspace-skill-paths', () => {
  it('normalizes rel', () => {
    expect(normalizeWorkspaceRel('\\foo\\bar')).toBe('foo/bar');
  });

  it('classifies indexed docs', () => {
    expect(isSkillIndexedDocumentRel('.agent/.skills/x/SKILL.md')).toBe(true);
    expect(isSkillIndexedDocumentRel('.agent/.skills/x/references/n.md')).toBe(true);
    expect(isSkillIndexedDocumentRel('.agent/.skills/x/other.txt')).toBe(false);
    expect(isSkillIndexedDocumentRel('.agent/skills/x/SKILL.md')).toBe(true);
    expect(isSkillIndexedDocumentRel('.agent/skills/x/references/n.md')).toBe(true);
    expect(isSkillIndexedDocumentRel('.agent/skills/x/other.txt')).toBe(false);
    expect(isSkillIndexedDocumentRel('.clawflow/skills/x/SKILL.md')).toBe(true);
  });

  it('classifies aux only', () => {
    expect(isSkillReferencesOnlyDocRel('.agent/.skills/x/references/n.md')).toBe(true);
    expect(isSkillReferencesOnlyDocRel('.agent/.skills/x/SKILL.md')).toBe(false);
    expect(isSkillReferencesOnlyDocRel('.agent/skills/x/references/n.md')).toBe(true);
    expect(isSkillReferencesOnlyDocRel('.agent/skills/x/SKILL.md')).toBe(false);
    expect(isSkillReferencesOnlyDocRel('.clawflow/skills/x/references/n.md')).toBe(true);
  });
});
