import { create } from 'zustand';
import type { WorkspaceSkillListItem } from '../../shared/workspace-skills-types';

type State = {
  list: WorkspaceSkillListItem[];
  loading: boolean;
  error: string | null;
  load: () => Promise<void>;
};

export const useWorkspaceSkillsStore = create<State>((set) => ({
  list: [],
  loading: false,
  error: null,
  load: async () => {
    set({ loading: true, error: null });
    try {
      const res = await window.electronAPI?.workspaceSkillsList?.();
      if (res && res.ok === true && Array.isArray(res.skills)) {
        set({ list: res.skills, loading: false });
        return;
      }
      const err = res && 'error' in res ? String((res as { error?: string }).error ?? '') : 'load failed';
      set({ list: [], loading: false, error: err || 'load failed' });
    } catch (e) {
      set({ list: [], loading: false, error: e instanceof Error ? e.message : String(e) });
    }
  },
}));
