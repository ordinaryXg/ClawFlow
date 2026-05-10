import { create } from 'zustand';
import type { WorkspaceToolSelection } from '../../shared/workspace-tools';

export interface WorkspaceMetaLite {
  id: string;
  name: string;
  createdAt: number;
  lastOpened: number;
}

interface WorkspaceState {
  activePath: string | null;
  meta: WorkspaceMetaLite | null;
  recent: string[];
  loading: boolean;
  refresh: () => Promise<void>;
  setWorkspace: (folderPath: string, opts?: { fromMainShell?: boolean }) => Promise<void>;
  /** 仅弹出系统选目录，不初始化工作区 */
  pickWorkspacePath: () => Promise<string | null>;
  /** 初始化（含 .tool）并切换为当前工作区 */
  commitNewWorkspace: (folderPath: string, tools: WorkspaceToolSelection) => Promise<void>;
  removeWorkspace: (folderPath: string) => Promise<{ ok: true; deletedFromDisk: boolean } | { ok: false; error: string }>;
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  activePath: null,
  meta: null,
  recent: [],
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
      const recent = await api.workspaceListRecent();
      set({
        activePath: active?.path ?? null,
        meta: (active?.meta as WorkspaceMetaLite | null | undefined) ?? null,
        recent: Array.isArray(recent) ? recent : [],
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

  pickWorkspacePath: async () => {
    return (await window.electronAPI?.workspacePickFolder?.()) ?? null;
  },

  commitNewWorkspace: async (folderPath: string, tools: WorkspaceToolSelection) => {
    set({ loading: true });
    try {
      await window.electronAPI?.workspaceEnsureInitialized?.(folderPath, { tools });
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
