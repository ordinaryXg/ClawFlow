import {
  DEFAULT_OUTBOUND_MERGE_WINDOW_MS,
  resolveOutboundMergeWindowMs,
} from './engine-runtime-prefs';

describe('resolveOutboundMergeWindowMs', () => {
  it('defaults to 3000ms', () => {
    expect(resolveOutboundMergeWindowMs(null)).toBe(DEFAULT_OUTBOUND_MERGE_WINDOW_MS);
  });

  it('clamps custom value', () => {
    expect(resolveOutboundMergeWindowMs({ outboundMergeWindowMs: 5000 })).toBe(5000);
    expect(resolveOutboundMergeWindowMs({ outboundMergeWindowMs: 100 })).toBe(500);
  });
});
