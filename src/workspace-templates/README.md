# 工作区初始化模板（源码内）

本目录下的 Markdown 由 Webpack 以纯文本打进**主进程** bundle。修改后需重新编译应用（`npm start` / 打包）才会影响**新建或缺失时补写**的工作区文件。

| 子目录 | 写入工作区路径 | 说明 |
|--------|----------------|------|
| `tool/` | _（模板文件已迁至代码生成）_ | `.tool/docs.md` / `browser.md` / `git.md` 由 `src/shared/workspace-tool-template-md.ts` 根据 `workspace-tool-manifest-bridge.ts` **自动生成**（缺失才写） |
| `role-agent/` | `<workspace>/.roleAgent/` | `TOOLS.md`、`AGENTS.md` 等 |

逻辑入口：

- `.tool` 正文：`workspace-service.ts` → `ensureWorkspaceToolBundle` + `buildWorkspaceTool*Md()`
- `.roleAgent`：`workspace-agent-bootstrap.ts` → `ensureWorkspaceAgentRoleTemplates`
