/** 工作区可用工具（与 `.agent/.tool/manifest.json` 的 `tools` 对齐；渲染进程可安全导入） */

/** manifest v2：原「browser」拆为三项，可独立关断 */
export type WorkspaceToolId =
  | 'docs'
  | 'git'
  | 'shell'
  | 'web_search'
  | 'web_scrape'
  | 'todos'
  | 'skills'
  | 'knowledge_base';

export const WORKSPACE_TOOL_IDS: readonly WorkspaceToolId[] = [
  'docs',
  'git',
  'shell',
  'web_search',
  'web_scrape',
  'todos',
  'skills',
  'knowledge_base',
] as const;

export type WorkspaceToolSelection = Partial<Record<WorkspaceToolId, boolean>>;

/** 读盘时可能仍含 v1 的 `browser` 总开关 */
export type WorkspaceToolSelectionInput = WorkspaceToolSelection & { browser?: boolean };

export const DEFAULT_WORKSPACE_TOOL_SELECTION: Record<WorkspaceToolId, boolean> = {
  docs: true,
  git: true,
  shell: true,
  web_search: true,
  web_scrape: true,
  todos: true,
  /** 新建工作区 / 未在 manifest 中显式写入时默认开启 Hermes 工作区技能 */
  skills: true,
  /** 知识库与记忆 FTS 检索（workspace_memory_search / workspace_knowledge_query 等） */
  knowledge_base: true,
};

/**
 * 合并默认与勾选；支持 v1 manifest 的 `browser`：在未见分项开关时，`browser` 同时作用于 web_search / web_scrape。
 */
export function mergeToolSelection(sel?: WorkspaceToolSelectionInput): Record<WorkspaceToolId, boolean> {
  const out: Record<WorkspaceToolId, boolean> = { ...DEFAULT_WORKSPACE_TOOL_SELECTION };
  if (!sel || typeof sel !== 'object') return out;

  const hasGranularBrowser = typeof sel.web_search === 'boolean' || typeof sel.web_scrape === 'boolean';

  if (!hasGranularBrowser && typeof sel.browser === 'boolean') {
    out.web_search = sel.browser;
    out.web_scrape = sel.browser;
  }

  for (const id of WORKSPACE_TOOL_IDS) {
    if (typeof sel[id] === 'boolean') out[id] = sel[id];
  }
  return out;
}
