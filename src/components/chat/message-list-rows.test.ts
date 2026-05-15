import { buildGroupedRows, computeTailWindowStart, type MessageListRow } from './message-list-rows';
import type { Message } from '../../store/modules/chatStore';

function msg(id: string, role: Message['role'], content: string): Message {
  return { id, role, content, timestamp: 1 };
}

describe('message-list-rows', () => {
  it('computeTailWindowStart keeps at least one row', () => {
    const rows: MessageListRow[] = [{ type: 'single', message: msg('1', 'user', 'x') }];
    expect(computeTailWindowStart(rows, 5, 10_000)).toBe(0);
  });

  it('computeTailWindowStart caps by row count', () => {
    const sorted = [1, 2, 3, 4, 5, 6, 7, 8].map((i) => msg(String(i), 'user', 'a'));
    const rows = buildGroupedRows(sorted);
    expect(rows.length).toBe(8);
    expect(computeTailWindowStart(rows, 5, 1_000_000)).toBe(3);
  });

  it('computeTailWindowStart respects char budget', () => {
    const sorted = [
      msg('1', 'user', 'a'.repeat(5000)),
      msg('2', 'user', 'b'.repeat(5000)),
      msg('3', 'user', 'c'.repeat(5000)),
    ];
    const rows = buildGroupedRows(sorted);
    const start = computeTailWindowStart(rows, 5, 8000);
    expect(start).toBeGreaterThanOrEqual(1);
    expect(start).toBeLessThanOrEqual(2);
  });
});
