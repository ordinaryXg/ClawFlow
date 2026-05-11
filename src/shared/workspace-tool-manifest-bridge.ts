/**
 * 将 `.tool/manifest.json` 中的能力开关映射到 ClawFlow 内置 tool function.name。
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
    'workspace_apply_patch_v2',
    'workspace_mkdir',
    'workspace_rename_path',
    'workspace_delete_path',
    'workspace_rollback_op',
    'workspace_run_tsc_no_emit',
    'workspace_rg_search',
  ],
  web_search: ['web_search'],
  web_scrape: ['web_scrape'],
  embedded_browser: ['open_embedded_browser'],
  git: ['workspace_git_status', 'workspace_git_diff', 'workspace_git_log'],
  todos: ['workspace_todo_list', 'workspace_todo_create', 'workspace_todo_update', 'workspace_todo_remove'],
  // 子 Agent：元数据管理 + 委派执行
  subagents: ['workspace_subagent_list', 'workspace_subagent_upsert', 'workspace_subagent_remove', 'delegate_to_subagent'],
  knowledge_base: ['workspace_knowledge_query'],
};

/** 不纳入 manifest 关断、始终暴露给模型的轻量工具 */
export const WORKSPACE_TOOLS_ALWAYS_ALLOWED: readonly string[] = ['get_date'];

const gatedNameSet: ReadonlySet<string> = new Set(
  WORKSPACE_TOOL_IDS.flatMap((id) => [...WORKSPACE_CAPABILITY_TOOL_NAMES[id]])
);

/** 供审计：`tool-runtime` 中每个受 manifest 约束的 function.name 都应在此集合或 ALWAYS_ALLOWED 中 */
export function getAllManifestGatedToolNames(): readonly string[] {
  return [...gatedNameSet];
}

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
