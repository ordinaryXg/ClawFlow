import {
  finishOutboundTurn,
  getMergedOutboundText,
  routeOutboundSend,
  takePendingSends,
  DEFAULT_OUTBOUND_MERGE_WINDOW_MS,
} from './chat-outbound-orchestrator';

describe('routeOutboundSend', () => {
  const conv = 'conv-1';

  it('starts a new turn when idle', () => {
    const r = routeOutboundSend({ conversationId: conv, content: 'hello', now: 1000 });
    expect(r.action).toBe('start');
    if (r.action === 'start') {
      expect(getMergedOutboundText(r.turn)).toBe('hello');
      finishOutboundTurn(conv, r.turn.generation);
    }
  });

  it('merges within merge window', () => {
    const t0 = 5000;
    const r1 = routeOutboundSend({ conversationId: conv, content: 'a', now: t0 });
    expect(r1.action).toBe('start');
    const r2 = routeOutboundSend({
      conversationId: conv,
      content: 'b',
      now: t0 + 1000,
      mergeWindowMs: DEFAULT_OUTBOUND_MERGE_WINDOW_MS,
    });
    expect(r2.action).toBe('merge');
    if (r2.action === 'merge') {
      expect(getMergedOutboundText(r2.turn)).toBe('a\n\nb');
      finishOutboundTurn(conv, r2.turn.generation);
    }
  });

  it('queues after merge window while turn active', () => {
    const t0 = 10_000;
    routeOutboundSend({ conversationId: conv, content: 'first', now: t0 });
    const r2 = routeOutboundSend({
      conversationId: conv,
      content: 'second',
      now: t0 + DEFAULT_OUTBOUND_MERGE_WINDOW_MS + 1,
      mergeWindowMs: DEFAULT_OUTBOUND_MERGE_WINDOW_MS,
    });
    expect(r2.action).toBe('queue');
    expect(takePendingSends(conv).map((x) => x.content)).toEqual(['second']);
  });
});
