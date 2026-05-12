import { create } from 'zustand';
import type { WorkspaceToolSelection } from '../../shared/workspace-tools';

export interface WorkspaceMetaLite {
  id: string;
  name: string;
  createdAt: number;
  lastOpened: number;
  gitRemoteUrl?: string;
}

export interface WorkspaceRecentEntry {
  path: string;
  gitRemoteUrl: string | null;
}

function normalizeRecentFromApi(raw: unknown): WorkspaceRecentEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: WorkspaceRecentEntry[] = [];
  for (const x of raw) {
    if (typeof x === 'string') {
      out.push({ path: x, gitRemoteUrl: null });
      continue;
    }
    if (!x || typeof x !== 'object') continue;
    const o = x as Record<string, unknown>;
    const p = typeof o.path === 'string' ? o.path : '';
    if (!p.trim()) continue;
    const g = typeof o.gitRemoteUrl === 'string' && o.gitRemoteUrl.trim() ? o.gitRemoteUrl.trim() : null;
    out.push({ path: p, gitRemoteUrl: g });
  }
  return out;
}

interface WorkspaceState {
  activePath: string | null;
  meta: WorkspaceMetaLite | null;
  /** 注册表 recent 条目（含 Git 克隆标记） */
  recentEntries: WorkspaceRecentEntry[];
  loading: boolean;
  refresh: () => Promise<void>;
  setWorkspace: (folderPath: string, opts?: { fromMainShell?: boolean }) => Promise<void>;
  /** 仅弹出系统选目录，不初始化工作区 */
  pickWorkspacePath: (opts?: { title?: string }) => Promise<string | null>;
  /** 初始化（含 .tool）并切换为当前工作区 */
  commitNewWorkspace: (
    folderPath: string,
    tools: WorkspaceToolSelection,
    opts?: { gitRemoteUrl?: string }
  ) => Promise<void>;
  removeWorkspace: (folderPath: string) => Promise<{ ok: true; deletedFromDisk: boolean } | { ok: false; error: string }>;
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  activePath: null,
  meta: null,
  recentEntries: [],
  loading: false,

  refresh: async () => {
    set({ loading: true });
    try {
      const api = window.electronAPI;
      if (!api?.workspaceGetActive || !api.workspaceListRecent) {
        set({ loading: false });
        return;
      }
      const active = await api.workspaceGetActive();
      const recentRaw = await api.workspaceListRecent();
      const metaRaw = active?.meta as WorkspaceMetaLite | null | undefined;
      set({
        activePath: active?.path ?? null,
        meta: metaRaw ?? null,
        recentEntries: normalizeRecentFromApi(recentRaw),
        loading: false,
      });
    } catch {
      set({ loading: false });
    }
  },

  setWorkspace: async (folderPath: string, opts?: { fromMainShell?: boolean }) => {
    set({ loading: true });
    try {
      await window.electronAPI?.workspaceSetActive?.(folderPath, opts ?? {});
      await get().refresh();
    } finally {
      set({ loading: false });
    }
  },

  pickWorkspacePath: async (opts?: { title?: string }) => {
    return (await window.electronAPI?.workspacePickFolder?.(opts)) ?? null;
  },

  commitNewWorkspace: async (folderPath: string, tools: WorkspaceToolSelection, opts?: { gitRemoteUrl?: string }) => {
    set({ loading: true });
    try {
      await window.electronAPI?.workspaceEnsureInitialized?.(folderPath, {
        tools,
        ...(opts?.gitRemoteUrl?.trim() ? { gitRemoteUrl: opts.gitRemoteUrl.trim() } : {}),
      });
      await get().setWorkspace(folderPath, { fromMainShell: true });
    } finally {
      set({ loading: false });
    }
  },

  removeWorkspace: async (folderPath: string) => {
    const api = window.electronAPI;
    if (!api?.workspaceRemove) {
      return { ok: false as const, error: 'workspaceRemove unavailable' };
    }
    set({ loading: true });
    try {
      const res = await api.workspaceRemove(folderPath);
      if (!res.ok) {
        return res;
      }
      await get().refresh();
      return { ok: true as const, deletedFromDisk: res.deletedFromDisk };
    } finally {
      set({ loading: false });
    }
  },
}));
