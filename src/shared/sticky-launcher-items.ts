/** 便签工作区「快捷收纳」：仅存元数据，不复制工作区文件。 */

export const STICKY_LAUNCHER_MIME = 'application/x-clawflow-sticky-launcher';

export type StickyLauncherBuiltinId = 'intelligence' | 'viewMode';

export type StickyLauncherDragPayloadV1 =
  | { version: 1; kind: 'builtin'; builtinId: StickyLauncherBuiltinId; label: string }
  | { version: 1; kind: 'path'; targetPath: string; label: string };

export type StickyLauncherSavedItem = {
  id: string;
} & (
  | { kind: 'builtin'; builtinId: StickyLauncherBuiltinId; label: string }
  | {
      kind: 'path';
      /** 收纳后实际路径（若在桌面则常为 stash 内路径） */
      targetPath: string;
      label: string;
      iconDataUrl?: string;
      /** 桌面收纳前移回退出恢复：指向原桌面绝对路径 */
      desktopOriginalPath?: string;
    }
);

function normWsKey(workspacePath: string): string {
  return workspacePath.trim().replace(/\\/g, '/').toLowerCase();
}

export function launcherStorageKey(workspacePath: string): string {
  return `clawflow.stickyLauncherItems.v1:${normWsKey(workspacePath)}`;
}

export function loadStickyLauncherItems(workspacePath: string): StickyLauncherSavedItem[] {
  if (!workspacePath.trim()) return [];
  try {
    const raw = localStorage.getItem(launcherStorageKey(workspacePath));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const out: StickyLauncherSavedItem[] = [];
    for (const row of parsed) {
      if (!row || typeof row !== 'object') continue;
      const o = row as Record<string, unknown>;
      const id = typeof o.id === 'string' && o.id.trim() ? o.id.trim() : '';
      if (!id) continue;
      if (o.kind === 'builtin' && (o.builtinId === 'intelligence' || o.builtinId === 'viewMode')) {
        const label = typeof o.label === 'string' && o.label.trim() ? o.label.trim() : o.builtinId;
        out.push({ id, kind: 'builtin', builtinId: o.builtinId, label });
        continue;
      }
      if (o.kind === 'path' && typeof o.targetPath === 'string' && o.targetPath.trim()) {
        const label = typeof o.label === 'string' && o.label.trim() ? o.label.trim() : o.targetPath.trim();
        const iconRaw = o.iconDataUrl;
        const iconDataUrl =
          typeof iconRaw === 'string' && iconRaw.startsWith('data:image/') ? iconRaw : undefined;
        const dor = o.desktopOriginalPath;
        const desktopOriginalPath =
          typeof dor === 'string' && dor.trim() ? dor.trim() : undefined;
        const base = { id, kind: 'path' as const, targetPath: o.targetPath.trim(), label };
        if (iconDataUrl && desktopOriginalPath) {
          out.push({ ...base, iconDataUrl, desktopOriginalPath });
        } else if (iconDataUrl) {
          out.push({ ...base, iconDataUrl });
        } else if (desktopOriginalPath) {
          out.push({ ...base, desktopOriginalPath });
        } else {
          out.push(base);
        }
      }
    }
    return out;
  } catch {
    return [];
  }
}

export function saveStickyLauncherItems(workspacePath: string, items: StickyLauncherSavedItem[]): void {
  if (!workspacePath.trim()) return;
  try {
    localStorage.setItem(launcherStorageKey(workspacePath), JSON.stringify(items));
  } catch {
    /* ignore */
  }
}

export function newLauncherItemId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  } catch {
    /* ignore */
  }
  return `ln_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function parseLauncherDragPayload(json: string): StickyLauncherDragPayloadV1 | null {
  try {
    const o = JSON.parse(json) as unknown;
    if (!o || typeof o !== 'object') return null;
    const v = (o as { version?: unknown }).version;
    if (v !== 1) return null;
    const kind = (o as { kind?: unknown }).kind;
    if (kind === 'builtin') {
      const builtinId = (o as { builtinId?: unknown }).builtinId;
      const label = String((o as { label?: unknown }).label ?? '').trim() || String(builtinId);
      if (builtinId !== 'intelligence' && builtinId !== 'viewMode') return null;
      return { version: 1, kind: 'builtin', builtinId, label };
    }
    if (kind === 'path') {
      const targetPath = String((o as { targetPath?: unknown }).targetPath ?? '').trim();
      if (!targetPath) return null;
      const label = String((o as { label?: unknown }).label ?? '').trim() || targetPath;
      return { version: 1, kind: 'path', targetPath, label };
    }
    return null;
  } catch {
    return null;
  }
}

export function dragPayloadToSaved(p: StickyLauncherDragPayloadV1): StickyLauncherSavedItem {
  const id = newLauncherItemId();
  if (p.kind === 'builtin') return { id, kind: 'builtin', builtinId: p.builtinId, label: p.label };
  return { id, kind: 'path', targetPath: p.targetPath, label: p.label };
}

/** 系统拖入的快捷方式/可执行文件：收纳为 path 项，不执行 workspace 文件导入 */
export function isOsLauncherStylePath(absPath: string): boolean {
  const s = absPath.trim();
  if (!s) return false;
  const lower = s.toLowerCase();
  if (lower.endsWith('.lnk')) return true;
  if (lower.endsWith('.exe')) return true;
  if (lower.endsWith('.bat') || lower.endsWith('.cmd') || lower.endsWith('.ps1')) return true;
  if (lower.endsWith('.app') || lower.endsWith('.app/')) return true;
  return false;
}
