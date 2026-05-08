import { create } from 'zustand';

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
  setWorkspace: (folderPath: string) => Promise<void>;
  pickFolder: () => Promise<void>;
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

  setWorkspace: async (folderPath: string) => {
    set({ loading: true });
    try {
      await window.electronAPI?.workspaceSetActive?.(folderPath);
      await get().refresh();
    } finally {
      set({ loading: false });
    }
  },

  pickFolder: async () => {
    const picked = await window.electronAPI?.workspacePickFolder?.();
    if (!picked) return;
    set({ loading: true });
    try {
      await window.electronAPI?.workspaceEnsureInitialized?.(picked);
      await get().setWorkspace(picked);
    } finally {
      set({ loading: false });
    }
  },
}));
