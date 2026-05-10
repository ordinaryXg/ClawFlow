/** 工作区可用工具（与 `.tool/manifest.json` 对齐；渲染进程可安全导入） */

export type WorkspaceToolId = 'docs' | 'browser' | 'git';

export const WORKSPACE_TOOL_IDS: readonly WorkspaceToolId[] = ['docs', 'browser', 'git'] as const;

export type WorkspaceToolSelection = Partial<Record<WorkspaceToolId, boolean>>;

export const DEFAULT_WORKSPACE_TOOL_SELECTION: Record<WorkspaceToolId, boolean> = {
  docs: true,
  browser: true,
  git: true,
};

export function mergeToolSelection(sel?: WorkspaceToolSelection): Record<WorkspaceToolId, boolean> {
  const out: Record<WorkspaceToolId, boolean> = { ...DEFAULT_WORKSPACE_TOOL_SELECTION };
  if (!sel || typeof sel !== 'object') return out;
  for (const id of WORKSPACE_TOOL_IDS) {
    const v = (sel as Record<string, unknown>)[id];
    if (typeof v === 'boolean') out[id] = v;
  }
  return out;
}
