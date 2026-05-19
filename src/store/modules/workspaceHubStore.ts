import { create } from 'zustand';

/** 左侧工作区「工作中心」展开的子视图：会话 / 待办 / 技能 / 知识库 */
export type WorkspaceHubBranch = 'sessions' | 'todos' | 'skills' | 'kb';

const LS_KEY = 'clawflow.workspaceHubByPath';

function loadMap(): Record<string, WorkspaceHubBranch> {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return {};
    const o = JSON.parse(raw) as unknown;
    if (!o || typeof o !== 'object') return {};
    const out: Record<string, WorkspaceHubBranch> = {};
    for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
      if (v === 'sessions' || v === 'todos' || v === 'skills' || v === 'kb') {
        out[k] = v;
      } else if (v === 'subagents') {
        out[k] = 'sessions';
      }
    }
    return out;
  } catch {
    return {};
  }
}

function persistMap(m: Record<string, WorkspaceHubBranch>) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(m));
  } catch {
    /* ignore */
  }
}

interface WorkspaceHubState {
  branchByPath: Record<string, WorkspaceHubBranch>;
  setHubBranch: (workspacePath: string, branch: WorkspaceHubBranch) => void;
  getHubBranch: (workspacePath: string | null | undefined) => WorkspaceHubBranch;
}

export const useWorkspaceHubStore = create<WorkspaceHubState>((set, get) => ({
  branchByPath: loadMap(),

  getHubBranch: (workspacePath) => {
    const p = workspacePath?.trim();
    if (!p) return 'sessions';
    return get().branchByPath[p] ?? 'sessions';
  },

  setHubBranch: (workspacePath, branch) => {
    const p = workspacePath.trim();
    if (!p) return;
    set((s) => {
      const next = { ...s.branchByPath, [p]: branch };
      persistMap(next);
      return { branchByPath: next };
    });
  },
}));
