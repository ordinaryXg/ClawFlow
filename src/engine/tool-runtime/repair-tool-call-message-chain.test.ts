import { repairToolCallMessageChain } from '../tool-runtime/repair-tool-call-message-chain';
import type { ChatMessage } from '../providers/types';

describe('repairToolCallMessageChain', () => {
  it('drops orphan tool without preceding assistant tool_calls', () => {
    const inMsgs: ChatMessage[] = [
      { role: 'user', content: 'hi' },
      { role: 'tool', tool_call_id: 'call_orphan', content: 'x' },
    ];
    const out = repairToolCallMessageChain(inMsgs);
    expect(out).toEqual([{ role: 'user', content: 'hi' }]);
  });

  it('fills missing tool responses before next assistant', () => {
    const inMsgs: ChatMessage[] = [
      {
        role: 'assistant',
        content: '',
        tool_calls: [
          { id: 'call_a', type: 'function', function: { name: 'f', arguments: '{}' } },
          { id: 'call_b', type: 'function', function: { name: 'g', arguments: '{}' } },
        ],
      },
      { role: 'tool', tool_call_id: 'call_a', content: 'ok' },
      { role: 'assistant', content: 'done' },
    ];
    const out = repairToolCallMessageChain(inMsgs);
    expect(out).toHaveLength(4);
    expect(out[1]).toMatchObject({ role: 'tool', tool_call_id: 'call_a', content: 'ok' });
    expect(out[2]).toMatchObject({ role: 'tool', tool_call_id: 'call_b' });
    expect(out[3]).toMatchObject({ role: 'assistant', content: 'done' });
  });

  it('fills pending tools before user when tool-loop ended early', () => {
    const inMsgs: ChatMessage[] = [
      {
        role: 'assistant',
        content: '',
        tool_calls: [{ id: 'call_x', type: 'function', function: { name: 'f', arguments: '{}' } }],
      },
      { role: 'user', content: 'next' },
    ];
    const out = repairToolCallMessageChain(inMsgs);
    expect(out).toHaveLength(3);
    expect(out[1].role).toBe('tool');
    expect((out[1] as { tool_call_id?: string }).tool_call_id).toBe('call_x');
    expect(out[2]).toMatchObject({ role: 'user', content: 'next' });
  });
});
