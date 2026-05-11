# ClawFlow PRD（从当前代码反推 / 可追溯）

> **写法原则**：每一条“已落地/未实现/待改进”都要能在仓库里找到对应证据（文件路径 + 关键符号/通道名/数据文件）。
>
> **适用范围**：面向当前仓库 `master` 的实现（Electron Forge + Webpack；Main/Preload/Renderer 分层）。

## 1. 产品定位

ClawFlow 是一个以 **Workspace（本地目录）为边界** 的桌面 AI 协作应用：

- 工作区内持久化：会话/工具能力开关/待办调度/爬取记录/子 Agent 槽位等元数据。
- 在 **Plan/Multitask** 等模式下，模型可使用“工具（tools）”完成受控的文件操作、Git、搜索/爬取、待办与子 Agent 元数据更新等。

## 2. 核心目标（阶段 3 对齐）

- **模型可调度的待办工具（IPC）**：模型可创建/更新/删除待办触发器；写盘后主进程调度并通知 UI 刷新。
- **子 Agent：先做 IPC + 最小 slots 状态**：只做 slots 元数据与 UI 展示/编辑闭环，不实现真正的“委派执行/并行调度”。
- **自主进化型 Skills（规划中）**：产品方向为类似 Hermes 的应用内技能管线；**已移除** OpenClaw 技能市场、`openclaw_skills_list` 与 `tools.skills` manifest 项。
- **知识库**：先确定数据模型（向量/路径）与 Retriever 工具形态，再决定 manifest 是否单独键及 RAG 管线。

## 3. 用户故事（User Stories）

### 3.1 Workspace 与能力治理（工具开关）

作为用户，我希望对每个工作区启用/禁用不同能力，并确保模型只看到已启用的工具。

- **已落地**
  - 工作区能力开关 manifest：`${WORKSPACE_ROOT}/.tool/manifest.json`（v2）  
    - 证据：`src/workspace-service.ts` 的 `ensureWorkspaceToolBundle()` / `readWorkspaceToolManifest()`
  - 发送模型前过滤工具 schema；执行阶段再次拒绝禁用工具  
    - 证据：`src/engine/clawflow-engine.ts` 调用 `filterToolSchemasByWorkspaceManifest(...)`  
    - 证据：`src/engine/tool-runtime.ts` 中 `toolNameAllowedByWorkspaceManifest(...)` 二次校验
  - 能力到 tool name 的映射  
    - 证据：`src/shared/workspace-tool-manifest-bridge.ts`

- **待改进**
  - `.tool/*.md` 说明文件当前“缺失才写”，已存在的旧文档可能与最新能力清单不一致  
    - 证据：`ensureWorkspaceToolBundle()` 的 `writeIfMissing()`

### 3.2 模型可调度待办（Todo Triggers）

作为用户，我希望可以通过 UI 或模型工具创建“定时触发的待办”，到点后可提示或自动提交给模型，并能在侧栏看到状态。

- **已落地**
  - 数据模型与持久化（工作区级）  
    - 证据：`src/shared/todo-triggers.ts`  
    - 证据：`${WORKSPACE_ROOT}/.clawflow/todo-triggers.v1.json`（见 `src/workspace-service.ts` 的路径函数）
  - 主进程调度与触发广播  
    - 证据：`src/todo-triggers-scheduler.ts` / `rescheduleTodoTriggersForWorkspace()`  
    - 证据：`src/todo-triggers-broadcast.ts`（`todo-triggers:updated`）
  - IPC（渲染进程读写）  
    - 证据：`src/index.ts`：`todoTriggers:list` / `todoTriggers:saveAll` / `todoTriggers:setAiReceipt`
  - UI 面板与 store  
    - 证据：`src/components/chat/TodoTriggersPanel.tsx`  
    - 证据：`src/store/modules/todoTriggerStore.ts`
  - **模型工具（阶段 3 新增）**：`workspace_todo_list/create/update/remove`  
    - 证据：`src/engine/tool-runtime.ts`（写盘后 `reschedule...` + `broadcastTodoTriggersUpdated`）

- **未实现 / 待改进**
  - 更丰富的触发类型（如 cron/日期选择器/自然语言解析）目前没有明确实现入口  
  - 更严格的 schema 校验与冲突处理策略可补齐（例如 interval 与 consumeOnFire 的约束）

### 3.3 子 Agent 槽位（slots 元数据）

作为用户，我希望在 Workspace Hub 里看到“子 Agent 槽位”，并能通过 UI 或模型工具维护这些槽位的元数据。

- **已落地**
  - 数据模型：`SubAgentSlot`  
    - 证据：`src/shared/sub-agent-types.ts`
  - 持久化：`${WORKSPACE_ROOT}/.clawflow/sub-agents.v1.json`  
    - 证据：`src/sub-agent-service.ts`
  - IPC（渲染进程同步）：`subAgents:list` / `subAgents:saveAll`  
    - 证据：`src/index.ts` 的 `registerSubAgentsIPC()`
  - store + Hub 面板展示  
    - 证据：`src/store/modules/subAgentStore.ts`  
    - 证据：`src/components/workspace-hub/SubAgentsHubPanel.tsx`
  - **模型工具（阶段 3 新增）**：`workspace_subagent_list/upsert/remove`  
    - 证据：`src/engine/tool-runtime.ts` + `sub-agent-broadcast.ts`

- **明确未实现（阶段 3 的非目标）**
  - 真实的“delegate_to_subagent / 并行执行 / 子 agent 生命周期调度”尚未实现（当前只有 slots 元数据）

### 3.4 爬取（web_scrape）与工件（artifacts）

作为用户，我希望模型能抓取公开网页并保存到工作区，随后在 UI 中查看爬取记录与全文工件。

- **已落地**
  - 工具 `web_scrape`：HTTP 拉取 → HTML 转纯文本 → 写入 `${WORKSPACE_ROOT}/.clawflow/scrapes/*.md` → 记录 job → 广播 UI  
    - 证据：`src/engine/tool-runtime.ts` 注册 `web_scrape`  
    - 证据：`src/scrape-runner.ts` 的 `runWebScrapeForTool()`（含写盘与 `broadcastScrapeJobsUpdated`）
  - UI（Jobs 列表/读取 artifact）  
    - 证据：`src/components/chat/ScrapePanel.tsx`  
    - 证据：`src/index.ts`：`scrape:listJobs` / `scrape:readArtifact`

- **待改进**
  - 对 SPA/强客户端渲染页面支持有限（当前走静态 HTML 拉取）
  - URL 安全策略/robots/限流等治理未成体系（目前仅基础 URL 校验与超时/大小限制）

### 3.5 技能（Skills，自主进化 / 规划中）

作为用户，我希望技能由应用内管线管理（类似 Hermes 的自主进化型 Skills），而非依赖外部 OpenClaw 技能市场或 CLI `skills` 子命令清单。

- **当前状态（已调整）**
  - **已移除**：OpenClaw 技能市场（远程索引 + 安装引导）、`skillMarket:getIndex` IPC、`window.electronAPI` 上的 `getSkills` / `installSkill` / `uninstallSkill` / `enableSkill` / `disableSkill` / `skillMarketGetIndex`；主进程侧对应 `openclaw:*Skill*` IPC 与 `openclaw-engine` 内 `skills install/list` 封装。
  - **已移除模型工具**：`openclaw_skills_list`（原注册于 `src/engine/tool-runtime.ts`）。
  - **manifest**：`WorkspaceToolId` 不再包含 `skills`；历史 `.tool/manifest.json` 中的 `tools.skills` 读盘时 **告警并忽略**（见 `src/workspace-service.ts` `readWorkspaceToolManifest()`）。
  - **UI 占位**：`/skills` 与 Workspace Hub「技能」分支为占位文案（`src/pages/SkillsPage/index.tsx`、`src/components/workspace-hub/SkillsHubPanel.tsx`）；i18n 键 `skills.hermes*`。
  - **工作区说明**：`.tool/skills.md` 由 `buildWorkspaceToolSkillsMd()` 生成，描述产品方向与「无 OpenClaw 市场」事实（`src/shared/workspace-tool-template-md.ts`）。

- **未实现（后续）**
  - 自主技能的数据模型、索引/版本、启用策略，以及与「动态 tools 注入 / 上下文注入」的边界（替代原 M2 仅围绕 OpenClaw list 工具的表述）。

### 3.6 知识库（Knowledge Base / RAG）

作为用户，我希望对工作区形成可检索的知识库（向量/路径）并提供 Retriever 工具供模型使用。

- **当前状态：占位**
  - manifest 键已预留：`tools.knowledge_base`  
  - 工具占位：`workspace_knowledge_query`  
    - 证据：`src/engine/tool-runtime.ts`（返回 stub 文案）

## 4. 数据模型（当前已落地）

- **Workspace 工具开关**：`${WORKSPACE_ROOT}/.tool/manifest.json`（v2）  
  - 证据：`src/shared/workspace-tools.ts`、`src/workspace-service.ts`
- **Todo Triggers**：`${WORKSPACE_ROOT}/.clawflow/todo-triggers.v1.json`  
  - 证据：`src/shared/todo-triggers.ts`、`src/todo-triggers-service.ts`
- **Sub-agent slots**：`${WORKSPACE_ROOT}/.clawflow/sub-agents.v1.json`  
  - 证据：`src/shared/sub-agent-types.ts`、`src/sub-agent-service.ts`
- **Scrape artifacts**：`${WORKSPACE_ROOT}/.clawflow/scrapes/*.md` + jobs list  
  - 证据：`src/scrape-runner.ts`、`src/scrape-service.ts`

## 5. 非功能需求（NFR）

- **安全**：Renderer 无 Node 权限；敏感信息不落到 Renderer；文件操作限制在 workspace 内（以实现为准）
- **可观测性**：关键链路需要“可定位”的日志/错误码（尤其是 IPC 与 OpenClaw 侧）
- **可恢复性**：端口占用、OpenClaw CLI 插件/symlink 权限问题（连接器场景）要有可操作的用户提示/修复路径（现阶段仍需补强）

## 6. 已落地功能清单（快速总结）

- 工作区：最近列表/切换/初始化；`.tool/manifest.json` 能力开关
- 工具：docs/git/web_search/web_scrape/embedded_browser +（阶段 3）todos/subagents + kb stub（**无** OpenClaw `skills list` 工具）
- 待办：UI 编辑 + IPC + 主进程调度 + 广播刷新
- 子 Agent：slots 最小元数据 + IPC + Hub 展示 + 广播刷新
- 爬取：`web_scrape` 保存工件 + UI 查看

## 7. 未实现/待改善清单（阶段 3 的下一步）

- 子 Agent 的真实委派执行（`delegate_to_subagent` 类工具）与生命周期管理
- 知识库数据模型与 Retriever 工具（向量索引、路径映射、增量更新、RAG 管线）
- 自主进化型 Skills：数据模型、运行时注入策略（动态 tools vs 上下文 vs 混合）、manifest 开关与缓存
- OpenClaw 在 Windows 下的 symlink 权限与冲突处理（主要影响**连接器/插件**路径；减少刷屏、提供“一键修复”）

