# 工作区工具能力文档（`.agent/.tool/*.md` 源码）

本目录下的 Markdown 会在工作区初始化或保存能力设置时写入 **`<workspace>/.agent/.tool/`**（仅缺失时创建，不覆盖已有文件）。

## 编辑方式

| 文件 | 写入目标 | manifest 开关 |
|------|----------|---------------|
| `docs.md` | `.agent/.tool/docs.md` | `tools.docs` |
| `browser.md` | `.agent/.tool/browser.md` | `tools.web_search` / `tools.web_scrape` |
| `shell.md` | `.agent/.tool/shell.md` | `tools.shell` |
| `git.md` | `.agent/.tool/git.md` | `tools.git` |
| `scheduling.md` | `.agent/.tool/scheduling.md` | `tools.scheduling` |
| `skills.md` | `.agent/.tool/skills.md` | `tools.skills` |
| `knowledge_base.md` | `.agent/.tool/knowledge_base.md` | `tools.knowledge_base` |
| `feishu.md` | `.agent/.tool/feishu.md` | `tools.feishu` |

## 占位符

- `{{TOOLS:docs}}` 等：由 `src/shared/workspace-tool-template-md.ts` 在打包时替换为 `workspace-tool-manifest-bridge.ts` 中的工具名列表。
- `{{ALWAYS_ALLOWED}}`：始终可用的轻量工具名。

**修改工具 function 名**请改 `workspace-tool-manifest-bridge.ts`，不要手写分裂列表。

## 构建

Webpack 将本目录 `.md` 作为纯文本打入主进程 bundle；修改后需 `npm start` 重新编译。已有工作区磁盘上的 `.md` 需手动同步或删除后触发补写。
