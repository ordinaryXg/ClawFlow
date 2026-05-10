/**
 * 将 `.tool/manifest.json` 中的能力开关映射到 ClawFlow 内置 tool function 名称。
 * 在 `tool-runtime.ts` 新增 register 时，须同步更新此映射（否则新工具默认不可见且执行会被拒绝）。
 */

import type { WorkspaceToolId } from './workspace-tools';
import { WORKSPACE_TOOL_IDS } from './workspace-tools';

/** 各能力类别包含的 tool function.name（与 createDefaultToolRuntime 注册名一致） */
export const WORKSPACE_CAPABILITY_TOOL_NAMES: Record<WorkspaceToolId, readonly string[]> = {
  docs: [
    'workspace_list_dir',
    'workspace_read_file_preview',
    'workspace_read_file',
    'workspace_write_file',
    'workspace_apply_patch',
    'workspace_mkdir',
    'workspace_rename_path',
    'workspace_delete_path',
    'workspace_rollback_op',
    'workspace_run_tsc_no_emit',
    'workspace_rg_search',
  ],
  browser: ['web_search', 'open_embedded_browser'],
  git: ['workspace_git_status', 'workspace_git_diff', 'workspace_git_log'],
};

/** 不纳入 manifest 关断、始终暴露给模型的轻量工具 */
export const WORKSPACE_TOOLS_ALWAYS_ALLOWED: readonly string[] = ['get_date'];

const gatedNameSet: ReadonlySet<string> = new Set(
  WORKSPACE_TOOL_IDS.flatMap((id) => [...WORKSPACE_CAPABILITY_TOOL_NAMES[id]])
);

export function isWorkspaceGatedToolName(name: string): boolean {
  return gatedNameSet.has(name);
}

export function toolNameAllowedByWorkspaceManifest(
  name: string,
  sel: Record<WorkspaceToolId, boolean>
): boolean {
  if (WORKSPACE_TOOLS_ALWAYS_ALLOWED.includes(name)) return true;
  if (!isWorkspaceGatedToolName(name)) return false;
  for (const id of WORKSPACE_TOOL_IDS) {
    if (!sel[id] && WORKSPACE_CAPABILITY_TOOL_NAMES[id].includes(name)) return false;
  }
  return true;
}

export function filterToolSchemasByWorkspaceManifest<T extends { type?: string; function: { name: string } }>(
  schemas: T[],
  sel: Record<WorkspaceToolId, boolean>
): T[] {
  return schemas.filter((s) => toolNameAllowedByWorkspaceManifest(s.function.name, sel));
}
