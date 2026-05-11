import {
  isWorkspaceRelativeUnderHermesSkillTree,
  patchSummaryTouchesHermesSkillTree,
} from './hermes-skill-index-hooks';

describe('hermes-skill-index-hooks', () => {
  it('detects skill tree prefix', () => {
    expect(isWorkspaceRelativeUnderHermesSkillTree('.clawflow/skills')).toBe(true);
    expect(isWorkspaceRelativeUnderHermesSkillTree('.clawflow/skills/foo/SKILL.md')).toBe(true);
    expect(isWorkspaceRelativeUnderHermesSkillTree('.clawflow\\skills\\foo\\SKILL.md')).toBe(true);
    expect(isWorkspaceRelativeUnderHermesSkillTree('.clawflow/other')).toBe(false);
  });

  it('detects patch summary touching skills', () => {
    expect(
      patchSummaryTouchesHermesSkillTree({
        added: ['src/x.ts'],
        modified: ['.clawflow/skills/a/SKILL.md'],
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
