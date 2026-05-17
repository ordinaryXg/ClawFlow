/** 渲染进程缓存：连续发送合并时间窗（毫秒），由设置页 / 对话页刷新。 */

export const OUTBOUND_MERGE_WINDOW_PREFS_EVENT = 'cf-outbound-merge-window-prefs-updated';

let cachedMs = 3000;

export function getCachedOutboundMergeWindowMs(): number {
  return cachedMs;
}

export function setCachedOutboundMergeWindowMs(ms: number): void {
  if (typeof ms === 'number' && Number.isFinite(ms)) {
    cachedMs = Math.max(0, Math.floor(ms));
  }
}

export async function refreshOutboundMergeWindowMsFromEngine(): Promise<number> {
  try {
    const rt = await window.electronAPI?.engineGetRuntimeSettings?.();
    if (rt && typeof rt.outboundMergeWindowMs === 'number') {
      setCachedOutboundMergeWindowMs(rt.outboundMergeWindowMs);
    }
  } catch {
    /* keep cache */
  }
  return getCachedOutboundMergeWindowMs();
}
