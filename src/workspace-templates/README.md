# 工作区初始化模板（源码内）

本目录下的 Markdown 由 Webpack 以纯文本打进**主进程** bundle。修改后需重新编译应用（`npm start` / 打包）才会影响**新建或缺失时补写**的工作区文件。

| 子目录 | 写入工作区路径 | 说明 |
|--------|----------------|------|
| `tool/` | _（模板文件已迁至 `src/shared/workspace-tool-docs/`）_ | `.agent/.tool/docs.md` / `browser.md` / … 由 `workspace-tool-template-md.ts` 加载并注入工具名列表（缺失才写） |
| `role-agent/` | `<workspace>/.agent/.roleAgent/` | `TOOLS.md`、`AGENTS.md` 等 |
| _（无单独子目录）_ | `<workspace>/.agent/.hermes/notes/` | Hermes 记忆笔记真源；由 `ensureWorkspaceInitialized` 引导 |
| _（无单独子目录）_ | `<workspace>/.agent/.clawflow/` | 主会话、周期调度、爬取、Hermes DB 等；由 `ensureWorkspaceInitialized` 创建 |
| `subagent-roles/` | _（应用缓存 `system/.subagent/.subroleAgent/`）_ | **系统级**子 Agent 模板（`deduce-evolution`、`cognitive-allocation`、`expectation-planning`）；工作区委派子 Agent 已移除 |

逻辑入口：

- `.agent/.tool` 正文：`workspace-service.ts` → `ensureWorkspaceToolBundle` + `buildWorkspaceTool*Md()`
- `.agent/.roleAgent`：`workspace-agent-bootstrap.ts` → `ensureWorkspaceAgentRoleTemplates`
