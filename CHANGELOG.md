# Changelog

## Unreleased

### Workspace 阶段 3：待办 / 子 Agent / 技能清单 / 知识库占位

- **Manifest**：`todos`、`subagents`、`skills`、`knowledge_base` 能力开关；默认开启待办与子 Agent 槽位，技能与知识库默认关闭。
- **工具**：`workspace_todo_*`、`workspace_subagent_*`、`openclaw_skills_list`、`workspace_knowledge_query`（Stub）；写盘后调度待办、广播刷新 UI。
- **持久化**：`.clawflow/sub-agents.v1.json`；IPC `subAgents:list` / `saveAll`；`onTodoTriggersUpdated` / `onSubAgentsUpdated`。
- **说明文件**：`.tool/todos.md`、`subagents.md`、`skills.md`、`knowledge_base.md`（缺失时补写）。

### 其它（本轮一并提交）

- **爬取**：`scrape-*` 服务与 `ScrapePanel` 等侧栏相关改动；`ambient-md.d.ts`、workspace 模板目录增量。
- **构建**：`webpack.rules.ts` 注释内反引号导致 Forge 解析失败，已去除反引号。

### Chat: thinking vs answer

- **UI**: 思考过程单独折叠块（淡色小字）；流式时与工具/正文 activity 分区展示；一旦有 activity，流式思考区自动收折为一行（仍可展开）。
- **引擎（DeepSeek）**: Plan/Multitask 优先走 `agentStreamChatCompletion`，按 SSE 增量推送 `delta.reasoning_content` / `delta.content`，实时 `onDelta`；其它模型仍用非流式 `chatCompletion` 并在有思考时整包打标记。
- **渲染**: Gateway WS 侧对 delta 做 `requestAnimationFrame` 合并刷新，减轻逐 token 重绘压力。
- **JSON 正文**: 若 `content` 为含思考/回答字段的 JSON，会拆成正文与思考再持久化；拉取历史时同样合并。

### Default workspace folder

- 应用内默认工作区路径由 `userData/Default Workspace` 改为 `userData/WorkSpace`。原 `Default Workspace` 目录不再使用，可自行删除。

### Workspace capability enforcement

- **Runtime**: Plan / Multitask 请求模型前，按工作区 `.tool/manifest.json` 过滤内置工具 schema；执行阶段对禁用类工具再次拒绝，避免历史轮次中的误调用产生副作用。
- **Manifest**: `mergeToolSelection` 仅合并已知键；manifest 中未知 `tools` 字段会记录警告并忽略。
- **文档**: `.tool/README.md` 模板（新建缺失文件时写入）说明 `.clawflow` / `.roleAgent` / `.tool` 分工；设置页文案与 `AGENTS.md` 模板已对齐「能力以 manifest 为准」。
- **已有工作区**: 若 `.tool/README.md` 早已存在，不会自动覆盖；需要时可手动删除该文件后由应用下次初始化时按模板重建。
