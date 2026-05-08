import { useCallback, useEffect, useState } from 'react';

export function clampWidth(n: number, minPx: number, maxPx: number): number {
  return Math.min(maxPx, Math.max(minPx, n));
}

export function usePersistedShellWidth(
  storageKey: string,
  defaultPx: number,
  minPx: number,
  maxPx: number
): [number, (v: number | ((prev: number) => number)) => void] {
  const [px, setPxState] = useState(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw == null) return defaultPx;
      const n = Number(raw);
      return Number.isFinite(n) ? clampWidth(n, minPx, maxPx) : defaultPx;
    } catch {
      return defaultPx;
    }
  });

  const setPx = useCallback(
    (v: number | ((prev: number) => number)) => {
      setPxState((prev) => {
        const next = typeof v === 'function' ? v(prev) : v;
        return clampWidth(next, minPx, maxPx);
      });
    },
    [minPx, maxPx]
  );

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, String(px));
    } catch {
      /* ignore quota / private mode */
    }
  }, [storageKey, px]);

  return [px, setPx];
}

export function startShellColumnDrag(
  startClientX: number,
  startWidthPx: number,
  onWidth: (w: number) => void,
  minPx: number,
  maxPx: number,
  /** 为 true 时：鼠标向右拖会减小该列宽度（用于右侧栏左侧分界线） */
  invertDelta: boolean
): void {
  const onMove = (ev: MouseEvent) => {
    const dx = ev.clientX - startClientX;
    const delta = invertDelta ? -dx : dx;
    onWidth(clampWidth(startWidthPx + delta, minPx, maxPx));
  };
  const onUp = () => {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    document.body.style.removeProperty('cursor');
    document.body.style.removeProperty('user-select');
  };
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
  document.body.style.cursor = 'col-resize';
  document.body.style.userSelect = 'none';
}
