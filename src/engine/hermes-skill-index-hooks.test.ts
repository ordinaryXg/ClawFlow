import {
  isWorkspaceRelativeUnderHermesSkillTree,
  patchSummaryTouchesHermesSkillTree,
} from './hermes-skill-index-hooks';

describe('hermes-skill-index-hooks', () => {
  it('detects skill tree prefix', () => {
    expect(isWorkspaceRelativeUnderHermesSkillTree('.agent/.skills')).toBe(true);
    expect(isWorkspaceRelativeUnderHermesSkillTree('.agent/.skills/foo/SKILL.md')).toBe(true);
    expect(isWorkspaceRelativeUnderHermesSkillTree('.agent\\.skills\\foo\\SKILL.md')).toBe(true);
    expect(isWorkspaceRelativeUnderHermesSkillTree('.agent/skills')).toBe(true);
    expect(isWorkspaceRelativeUnderHermesSkillTree('.agent/skills/foo/SKILL.md')).toBe(true);
    expect(isWorkspaceRelativeUnderHermesSkillTree('.clawflow/skills/foo/SKILL.md')).toBe(true);
    expect(isWorkspaceRelativeUnderHermesSkillTree('.agent/.clawflow/skills/foo/SKILL.md')).toBe(true);
    expect(isWorkspaceRelativeUnderHermesSkillTree('.clawflow/other')).toBe(false);
  });

  it('detects patch summary touching skills', () => {
    expect(
      patchSummaryTouchesHermesSkillTree({
        added: ['src/x.ts'],
        modified: ['.agent/.skills/a/SKILL.md'],
        deleted: [],
      })
    ).toBe(true);
    expect(
      patchSummaryTouchesHermesSkillTree({
        added: ['.agent/.clawflow/skills/b/SKILL.md'],
        modified: [],
        deleted: [],
      })
    ).toBe(true);
    expect(
      patchSummaryTouchesHermesSkillTree({
        added: [],
        modified: ['README.md'],
        deleted: [],
      })
    ).toBe(false);
  });
});
