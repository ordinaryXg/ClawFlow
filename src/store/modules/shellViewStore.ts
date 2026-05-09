import { create } from 'zustand';

/** 标准布局 | 备用视图（第二种模式的具体 UI 后续再接） */
export type ShellViewMode = 'standard' | 'alternate';

const STORAGE_KEY = 'clawflow.shellViewMode';

function loadMode(): ShellViewMode {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'alternate' || v === 'standard') return v;
  } catch {
    /* ignore */
  }
  return 'standard';
}

function persistMode(mode: ShellViewMode): void {
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    /* ignore */
  }
}

type ShellViewState = {
  mode: ShellViewMode;
  toggleMode: () => void;
  setMode: (mode: ShellViewMode) => void;
};

export const useShellViewStore = create<ShellViewState>((set, get) => ({
  mode: loadMode(),
  toggleMode: () => {
    const next: ShellViewMode = get().mode === 'standard' ? 'alternate' : 'standard';
    persistMode(next);
    set({ mode: next });
  },
  setMode: (mode) => {
    persistMode(mode);
    set({ mode });
  },
}));
