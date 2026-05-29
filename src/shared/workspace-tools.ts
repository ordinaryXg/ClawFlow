/** 工作区可用工具（与 `.agent/.tool/manifest.json` 的 `tools` 对齐；渲染进程可安全导入） */

/** manifest v2：原「browser」拆为三项，可独立关断 */
export type WorkspaceToolId =
  | 'docs'
  | 'git'
  | 'shell'
  | 'web_search'
  | 'web_scrape'
  | 'scheduling'
  | 'skills'
  | 'knowledge_base'
  | 'feishu';

export const WORKSPACE_TOOL_IDS: readonly WorkspaceToolId[] = [
  'docs',
  'git',
  'shell',
  'web_search',
  'web_scrape',
  'scheduling',
  'skills',
  'knowledge_base',
  'feishu',
] as const;

export type WorkspaceToolSelection = Partial<Record<WorkspaceToolId, boolean>>;

export const DEFAULT_WORKSPACE_TOOL_SELECTION: Record<WorkspaceToolId, boolean> = {
  docs: true,
  git: true,
  shell: true,
  web_search: true,
  web_scrape: true,
  scheduling: true,
  /** 新建工作区 / 未在 manifest 中显式写入时默认开启工作区技能 */
  skills: true,
  /** 知识库与记忆 FTS 检索（workspace_memory_search / workspace_knowledge_query 等） */
  knowledge_base: true,
  /** 飞书 Open Platform（lark-cli 封装） */
  feishu: true,
};

/** 合并默认与 manifest 勾选 */
export function mergeToolSelection(sel?: WorkspaceToolSelection): Record<WorkspaceToolId, boolean> {
  const out: Record<WorkspaceToolId, boolean> = { ...DEFAULT_WORKSPACE_TOOL_SELECTION };
  if (!sel || typeof sel !== 'object') return out;

  for (const id of WORKSPACE_TOOL_IDS) {
    if (typeof sel[id] === 'boolean') out[id] = sel[id];
  }
  return out;
}
