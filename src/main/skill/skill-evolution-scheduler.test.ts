import type { StoredMessage } from '../../engine/session-store';
import { classifyEvolutionOutcomeMarkdown, isEvolutionCountedUserMessage, lastRoundCountsTowardEvolution } from './skill-evolution-scheduler';

function u(content: string, channel?: string): StoredMessage {
  return { id: 'u', role: 'user', content, timestamp: 1, ...(channel ? { channel } : {}) };
}

function a(content: string, channel?: string, tool_calls?: unknown[]): StoredMessage {
  return {
    id: 'a',
    role: 'assistant',
    content,
    timestamp: 2,
    ...(channel ? { channel } : {}),
    ...(tool_calls ? { tool_calls: tool_calls as any } : {}),
  };
}

function t(tool_call_id: string, content: string): StoredMessage {
  return { id: 't', role: 'tool', content, timestamp: 3, tool_call_id };
}

describe('lastRoundCountsTowardEvolution', () => {
  it('counts user_manual + final assistant', () => {
    const msgs: StoredMessage[] = [u('hi', 'user_manual'), a('ok')];
    expect(lastRoundCountsTowardEvolution(msgs)).toBe(true);
  });

  it('counts user_feishu + final assistant', () => {
    const msgs: StoredMessage[] = [u('x', 'user_feishu'), a('y')];
    expect(lastRoundCountsTowardEvolution(msgs)).toBe(true);
  });

  it('ignores user_todo channel', () => {
    const msgs: StoredMessage[] = [u('t', 'user_todo'), a('a')];
    expect(lastRoundCountsTowardEvolution(msgs)).toBe(false);
  });

  it('skips intermediate assistant with tool_calls and tools before final assistant', () => {
    const msgs: StoredMessage[] = [
      u('read file', 'user_manual'),
      a('', undefined, [{ id: 'c1', type: 'function', function: { name: 'workspace_read_file', arguments: '{}' } }]),
      t('c1', '{"ok":true}'),
      a('Here is the answer.'),
    ];
    expect(lastRoundCountsTowardEvolution(msgs)).toBe(true);
  });

  it('false when last is assistant_tool_summary', () => {
    const msgs: StoredMessage[] = [u('q', 'user_manual'), a('summary', 'assistant_tool_summary')];
    expect(lastRoundCountsTowardEvolution(msgs)).toBe(false);
  });

  it('false when last is not assistant', () => {
    expect(lastRoundCountsTowardEvolution([u('a', 'user_manual')])).toBe(false);
  });
});

describe('isEvolutionCountedUserMessage', () => {
  it('legacy user without channel counts', () => {
    expect(isEvolutionCountedUserMessage(u('x'))).toBe(true);
  });
});

describe('classifyEvolutionOutcomeMarkdown', () => {
  it('detects memory and skills aspects', () => {
    const text = 'Updated `.agent/.hermes/memory/notes.md` via hermes_memory_upsert and added `.agent/.skills/foo/SKILL.md`.';
    const r = classifyEvolutionOutcomeMarkdown(text);
    expect(r.aspectKeys).toEqual(['memory', 'skills']);
    expect(r.titleZh).toContain('记忆整理');
    expect(r.titleZh).toContain('技能维护');
  });

  it('detects role doc aspect', () => {
    const r = classifyEvolutionOutcomeMarkdown('扩写 .agent/.roleAgent/AGENTS.md 与 SOUL.md');
    expect(r.aspectKeys).toContain('role_doc');
  });
});
