import { isSkillIndexedDocumentRel, isSkillReferencesOnlyDocRel, normalizeWorkspaceRel } from './workspace-skill-paths';

describe('workspace-skill-paths', () => {
  it('normalizes rel', () => {
    expect(normalizeWorkspaceRel('\\foo\\bar')).toBe('foo/bar');
  });

  it('classifies indexed docs', () => {
    expect(isSkillIndexedDocumentRel('.clawflow/skills/x/SKILL.md')).toBe(true);
    expect(isSkillIndexedDocumentRel('.clawflow/skills/x/references/n.md')).toBe(true);
    expect(isSkillIndexedDocumentRel('.clawflow/skills/x/other.txt')).toBe(false);
  });

  it('classifies aux only', () => {
    expect(isSkillReferencesOnlyDocRel('.clawflow/skills/x/references/n.md')).toBe(true);
    expect(isSkillReferencesOnlyDocRel('.clawflow/skills/x/SKILL.md')).toBe(false);
  });
});
