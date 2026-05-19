import {
  diffEvolutionSnapshots,
  evolutionDiffHasChanges,
  type EvolutionFileSnapshot,
} from './skill-evolution-snapshot';

describe('diffEvolutionSnapshots', () => {
  it('detects added, modified, deleted', () => {
    const before: EvolutionFileSnapshot = {
      '.agent/.memory/a.md': 'old',
      '.agent/.skills/x/SKILL.md': 'skill',
    };
    const after: EvolutionFileSnapshot = {
      '.agent/.memory/a.md': 'new',
      '.agent/.skills/x/SKILL.md': 'skill',
      '.agent/.roleAgent/AGENTS.md': 'agent',
    };
    const diff = diffEvolutionSnapshots(before, after);
    expect(evolutionDiffHasChanges(diff)).toBe(true);
    expect(diff.find((d) => d.relPath === '.agent/.memory/a.md')?.kind).toBe('modified');
    expect(diff.find((d) => d.relPath === '.agent/.roleAgent/AGENTS.md')?.kind).toBe('added');
  });

  it('empty when identical', () => {
    const snap: EvolutionFileSnapshot = { '.agent/.memory/a.md': 'x' };
    expect(evolutionDiffHasChanges(diffEvolutionSnapshots(snap, { ...snap }))).toBe(false);
  });
});
