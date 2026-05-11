/**
 * `.tool/*.md` 正文由本模块按 `WORKSPACE_CAPABILITY_TOOL_NAMES` 自动生成，与引擎注册的工具名保持同步。
 * 修改能力清单请改 `workspace-tool-manifest-bridge.ts`，勿手写分裂列表。
 */

import { WORKSPACE_CAPABILITY_TOOL_NAMES, WORKSPACE_TOOLS_ALWAYS_ALLOWED } from './workspace-tool-manifest-bridge';

function bulletTools(names: readonly string[]): string {
  return names.map((n) => `- \`${n}\``).join('\n');
}

/** `.tool/docs.md` */
export function buildWorkspaceToolDocsMd(): string {
  return [
    `# 文档读写能力`,
    ``,
    `下列 **模型工具** 受 manifest 中 \`tools.docs\` 关断：`,
    ``,
    bulletTools(WORKSPACE_CAPABILITY_TOOL_NAMES.docs),
    ``,
    `> 轻量工具 ${WORKSPACE_TOOLS_ALWAYS_ALLOWED.map((n) => `\`${n}\``).join('、')} 始终可用，不参与能力关断。`,
    ``,
    `适用于：整理笔记、批量处理文本、生成与修改项目内文件等（受工作区沙箱与安全规则约束）。`,
    ``,
  ].join('\n');
}

/** `.tool/browser.md` —— 网络搜索 / 爬取 / 内嵌打开 分项关断 */
export function buildWorkspaceToolBrowserMd(): string {
  return [
    `# 网络与页面能力`,
    ``,
    `以下三类能力在 manifest 中 **彼此独立**（\`tools.web_search\`、\`tools.web_scrape\`、\`tools.embedded_browser\`）。`,
    ``,
    `## 网页搜索（tools.web_search）`,
    bulletTools(WORKSPACE_CAPABILITY_TOOL_NAMES.web_search),
    ``,
    `## 网络数据爬取（tools.web_scrape）`,
    bulletTools(WORKSPACE_CAPABILITY_TOOL_NAMES.web_scrape),
    ``,
    `## 应用内打开页面（tools.embedded_browser）`,
    bulletTools(WORKSPACE_CAPABILITY_TOOL_NAMES.embedded_browser),
    ``,
    `> 说明：\`web_scrape\` 当前为主进程 HTTP 拉取并解析 HTML；与侧栏内嵌 WebView 为不同链路。`,
    ``,
  ].join('\n');
}

/** `.tool/git.md` */
export function buildWorkspaceToolGitMd(): string {
  return [
    `# Git 操作能力`,
    ``,
    `下列工具受 \`tools.git\` 关断：`,
    ``,
    bulletTools(WORKSPACE_CAPABILITY_TOOL_NAMES.git),
    ``,
    `在工作区内执行受策略允许的 Git 命令（具体以引擎实现为准）。`,
    ``,
  ].join('\n');
}

/** `.tool/todos.md` */
export function buildWorkspaceToolTodosMd(): string {
  return [
    `# 待办与调度`,
    ``,
    `下列工具受 \`tools.todos\` 关断；数据持久化在 \`.clawflow/\`，修改后会刷新侧栏待办并与主进程调度对齐：`,
    ``,
    bulletTools(WORKSPACE_CAPABILITY_TOOL_NAMES.todos),
    ``,
  ].join('\n');
}

/** `.tool/subagents.md` */
export function buildWorkspaceToolSubagentsMd(): string {
  return [
    `# 子 Agent 槽位`,
    ``,
    `下列工具受 \`tools.subagents\` 关断；用于登记/调整最小槽位元数据（\`.clawflow/sub-agents.v1.json\`），不包含真正的进程级委派：`,
    ``,
    bulletTools(WORKSPACE_CAPABILITY_TOOL_NAMES.subagents),
    ``,
  ].join('\n');
}

/** `.tool/skills.md` */
export function buildWorkspaceToolSkillsMd(): string {
  return [
    `# OpenClaw 技能清单`,
    ``,
    `下列工具受 \`tools.skills\` 关断。通过 OpenClaw CLI 列出已安装技能；**不会**自动把技能全文注入为模型工具，仅为可编排的查询入口：`,
    ``,
    bulletTools(WORKSPACE_CAPABILITY_TOOL_NAMES.skills),
    ``,
  ].join('\n');
}

/** `.tool/knowledge_base.md` */
export function buildWorkspaceToolKnowledgeBaseMd(): string {
  return [
    `# 知识库（占位）`,
    ``,
    `下列工具受 \`tools.knowledge_base\` 关断。当前为占位实现，后续可接向量索引与 RAG 管道：`,
    ``,
    bulletTools(WORKSPACE_CAPABILITY_TOOL_NAMES.knowledge_base),
    ``,
  ].join('\n');
}
