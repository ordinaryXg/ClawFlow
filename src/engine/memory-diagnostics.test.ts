import { analyzeConversationMessages } from './memory-diagnostics';

describe('analyzeConversationMessages', () => {
  it('aggregates role counts and tool/reasoning chars', () => {
    const r = analyzeConversationMessages([
      { id: '1', role: 'user', content: 'hi', timestamp: 1 },
      { id: '2', role: 'assistant', content: 'ok', reasoning_content: 'think', timestamp: 2 },
      { id: '3', role: 'tool', content: 'x'.repeat(1000), timestamp: 3, tool_call_id: 't1' },
    ]);
    expect(r.totalMessages).toBe(3);
    expect(r.byRole.user).toBe(1);
    expect(r.toolResultChars).toBe(1000);
    expect(r.reasoningChars).toBe(5);
    expect(r.largestMessages[0]?.chars).toBe(1000);
  });
});
