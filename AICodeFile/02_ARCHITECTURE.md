# ClawFlow 架构说明（以当前代码为准）

## 0. TL;DR（3 分钟抓住主线）

- **三层**：Main（系统/引擎/调度/FS）→ Preload（安全桥）→ Renderer（React UI）
- **工作区是边界**：`${WORKSPACE_ROOT}/.agent/.clawflow`（主会话与元数据）与 `${WORKSPACE_ROOT}/.agent/.tool`（能力开关与说明）；子 Agent 区域在 `${WORKSPACE_ROOT}/.subagent/`
- **工具（tools）是治理对象**：发送模型前按 `.tool/manifest.json` 过滤可见 schema；执行时再次校验拒绝禁用工具
- **阶段 3 新增主线**：待办（调度）与子 Agent 槽位（slots）形成“写盘 → 广播 → UI 刷新”闭环

## 1. 关键目录与数据文件

### 1.1 工作区内（Workspace Root）

- `${WORKSPACE_ROOT}/.agent/.tool/manifest.json`：工具能力开关（v2）
  - 代码证据：`src/workspace-service.ts` `ensureWorkspaceToolBundle()` / `readWorkspaceToolManifest()`
- `${WORKSPACE_ROOT}/.agent/.tool/*.md`：能力说明（缺失才补写）
  - 代码证据：`src/shared/workspace-tool-template-md.ts` + `ensureWorkspaceToolBundle()`
- `${WORKSPACE_ROOT}/.agent/.clawflow/todo-triggers.v1.json`：待办调度数据
  - 代码证据：`src/todo-triggers-service.ts`
- `${WORKSPACE_ROOT}/.agent/.clawflow/sub-agents.v1.json`：子 Agent 槽位数据（元数据）
  - 代码证据：`src/sub-agent-service.ts`
- `${WORKSPACE_ROOT}/.agent/.clawflow/scrapes/*.md`：网页爬取工件（全文）
  - 代码证据：`src/scrape-runner.ts`
- `${WORKSPACE_ROOT}/.subagent/.subclawflow/`、`.subagent/.submemory/`、`.subagent/.subroleAgent/`：子 Agent 工作缓存、独立记忆、角色模板落盘
  - 代码证据：`src/workspace-service.ts`、`src/workspace-agent-layout.ts`

## 2. 进程分层与职责

### 2.1 Main（主进程）

- 入口：`src/index.ts`
- 主要职责：
  - Workspace 管理、初始化与文件系统操作（`src/workspace-service.ts` / `src/workspace-explorer.ts`）
  - 引擎 IPC：`registerClawFlowIPC()`（`src/engine/clawflow-engine.ts`）
  - 工具运行时：`createDefaultToolRuntime()`（`src/engine/tool-runtime.ts`）
  - 待办调度：`rescheduleTodoTriggersForWorkspace()`（`src/todo-triggers-scheduler.ts`）
  - 爬取记录 IPC：`scrape:listJobs` / `scrape:readArtifact`（`src/index.ts` + `src/scrape-service.ts`）
  - 子 Agent IPC：`subAgents:list` / `subAgents:saveAll`（`src/index.ts`）
  - OpenClaw 相关：`registerOpenClawIPC()`（`src/engine/openclaw-engine.ts`）——**当前保留连接器/插件等 CLI 能力**；内置 **Skills 市场与 `openclaw:*Skill*` IPC 已移除**（见 PRD §3.5）。

### 2.2 Preload（安全桥）

- 入口：`src/preload.ts`
- 职责：通过 `contextBridge.exposeInMainWorld('electronAPI', ...)` 暴露受控 API（调用 `ipcRenderer.invoke` 与事件订阅）。

### 2.3 Renderer（渲染进程 UI）

- 组件/页面入口以 `src/components/*` 与 `src/pages/*` 为主
- Workspace Hub（右侧/侧栏）相关：
  - 待办：`src/components/chat/TodoTriggersPanel.tsx` + `src/store/modules/todoTriggerStore.ts`
  - 子 Agent 槽位：`src/components/workspace-hub/SubAgentsHubPanel.tsx` + `src/store/modules/subAgentStore.ts`
  - 爬取：`src/components/chat/ScrapePanel.tsx`
  - Skills（占位）：`src/pages/SkillsPage/index.tsx`、`src/components/workspace-hub/SkillsHubPanel.tsx`（Hermes 式自主技能方向，尚未接业务数据）

## 3. 工具（Tools）治理链路

### 3.1 工具注册与执行

- 工具注册：`src/engine/tool-runtime.ts` `createDefaultToolRuntime()`
- 执行校验：
  - 执行阶段二次校验：`ToolRuntime.executeToolCalls()` 内 `toolNameAllowedByWorkspaceManifest(...)`
    - 代码证据：`src/engine/tool-runtime.ts`

### 3.2 manifest 映射与 schema 过滤

- 能力 → tool name 映射：`src/shared/workspace-tool-manifest-bridge.ts`
- 发送模型前过滤：`src/engine/clawflow-engine.ts` 调用 `filterToolSchemasByWorkspaceManifest(...)`

## 4. 阶段 3 的两个闭环（最重要）

### 4.1 待办（模型工具 / IPC / 调度 / UI）

- 数据：`todo-triggers.v1.json`（位于 `.agent/.clawflow/`；`src/todo-triggers-service.ts`）
- IPC：`todoTriggers:list/saveAll/setAiReceipt`（`src/index.ts`）
- 调度：`rescheduleTodoTriggersForWorkspace()`（`src/todo-triggers-scheduler.ts`）
- 广播刷新：`todo-triggers:updated`（`src/todo-triggers-broadcast.ts` + `src/preload.ts` 订阅）
- 模型工具：`workspace_todo_*`（`src/engine/tool-runtime.ts`）

### 4.2 子 Agent 槽位（slots）

- 数据：`sub-agents.v1.json`（位于 `.agent/.clawflow/`；`src/sub-agent-service.ts`）
- IPC：`subAgents:list/saveAll`（`src/index.ts`）
- 广播刷新：`subAgents:updated`（`src/sub-agent-broadcast.ts` + `src/preload.ts` 订阅）
- 模型工具：`workspace_subagent_*`（`src/engine/tool-runtime.ts`）

### 4.3 Skills（占位；已移除 OpenClaw 技能市场）

- **无** `openclaw_skills_list`、**无** `tools.skills` manifest 类、**无** `skillMarket:getIndex` / `skill-store` 链路（见 `03_PRD.md` §3.5）。
- UI 与 Hub 仅为产品占位；`.tool/skills.md` 说明由 `src/shared/workspace-tool-template-md.ts` `buildWorkspaceToolSkillsMd()` 维护。

## 5. 已知风险点（当前代码可见）

- **Windows symlink 权限**：使用 OpenClaw CLI 安装/同步**插件技能**等场景时，全局状态目录下可能因 `EPERM/EEXIST` 创建 symlink 失败并刷屏（连接器/OpenClaw 侧；与已移除的内置技能市场无关）。需要后续统一修复策略与用户提示。
- **知识库/RAG**：目前仅有占位工具 `workspace_knowledge_query`，尚无索引构建与 Retriever 实现。

