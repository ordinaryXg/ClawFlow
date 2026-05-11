# ClawFlow 任务清单（与 PRD/架构对齐）

> 本任务清单只保留“下一步要做什么”。历史长记录已移除，避免与代码漂移。

## P0：阶段 3 闭环稳定（应优先完成）

### T0.1 待办：模型工具与 UI 一致性自测

- **目标**：`workspace_todo_*` 写盘后，UI 能刷新并且调度正确
- **验收**
  - [ ] 在启用 `tools.todos=true` 的工作区里，模型调用 `workspace_todo_create` 后：
    - 侧栏待办计数刷新（Workspace Hub）
    - `TodoTriggersPanel` 能看到新条目
  - [ ] 更新/删除同理；禁用 `tools.todos=false` 时工具执行应被拒绝（返回“capability disabled”）
- **代码落点（证据/改动点）**
  - `src/engine/tool-runtime.ts`（`workspace_todo_*`）
  - `src/todo-triggers-service.ts` / `src/todo-triggers-scheduler.ts`
  - `src/todo-triggers-broadcast.ts` / `src/preload.ts` / `src/components/WorkspaceSidebar.tsx`

### T0.2 子 Agent slots：模型工具与 Hub 刷新一致

- **目标**：`workspace_subagent_*` 写盘后，Workspace Hub 子 Agent 数与列表刷新
- **验收**
  - [ ] `workspace_subagent_upsert/remove` 后 `SubAgentsHubPanel` 刷新
  - [ ] 禁用 `tools.subagents=false` 时工具执行被拒绝
- **代码落点**
  - `src/engine/tool-runtime.ts`
  - `src/sub-agent-service.ts` / `src/sub-agent-broadcast.ts`
  - `src/index.ts`（`subAgents:list/saveAll`）
  - `src/store/modules/subAgentStore.ts` / `src/components/WorkspaceSidebar.tsx`

### T0.3 `.tool/*.md` 与 manifest 能力清单一致

- **目标**：新增能力的说明文件稳定生成，避免文档漂移
- **验收**
  - [ ] 新建 workspace 时 `.tool/` 下包含：`docs.md`、`browser.md`、`git.md`、`todos.md`、`subagents.md`、`skills.md`、`knowledge_base.md`
  - [ ] 对旧 workspace：至少能通过“删除对应 md 后重建”得到最新版本（当前策略是缺失才写）
- **代码落点**
  - `src/shared/workspace-tool-template-md.ts`
  - `src/workspace-service.ts` `ensureWorkspaceToolBundle()`

## P1：自主 Skills 与知识库最小闭环

### T1.1 自主进化型 Skills：设计落地（替代 OpenClaw 市场）

- **目标**：在**无** OpenClaw 技能市场、**无** `openclaw_skills_list` 工具的前提下，定义 Hermes 式 Skills 的存储、版本与注入策略
- **验收**
  - [ ] 文档说明：Skills 数据落点、与模型上下文/tools 的边界、失败降级
  - [ ] 未来 manifest 键（若需要）与 `workspace-tool-manifest-bridge.ts` 扩展方式明确
- **代码线索（当前占位 / 扩展点）**
  - `src/pages/SkillsPage/index.tsx`、`src/components/workspace-hub/SkillsHubPanel.tsx`（UI 占位）
  - `src/shared/workspace-tool-template-md.ts` `buildWorkspaceToolSkillsMd()`
  - `src/shared/workspace-tools.ts`（当前 **无** `skills` 工具类 ID；新增能力时同步 bridge + runtime）

### T1.2 知识库：替换 `workspace_knowledge_query` stub

- **目标**：确定数据模型（向量/路径）与 Retriever 工具形态，跑通最小 RAG
- **验收**
  - [ ] 能对工作区指定目录建立索引
  - [ ] `workspace_knowledge_query` 返回“可引用证据”（路径 + 摘要/行范围）
- **代码线索**
  - `src/engine/tool-runtime.ts`（占位工具）
  - 新增：索引构建模块 + 检索模块 + 数据文件格式（待定）

## P2：子 Agent 真委派（后置）

### T2.1 delegate_to_subagent（可选）

- **目标**：在 slots 元数据之上，实现最小委派执行与结果回传
- **验收**
  - [ ] 至少 1 个子 Agent 可独立运行并回传结果
  - [ ] 有取消/超时/资源隔离策略

