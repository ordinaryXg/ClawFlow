# ClawFlow 项目总览（以当前代码反推）

## 基本信息

- **仓库根目录**：`${REPO_ROOT}`
- **应用形态**：Electron 桌面应用（Main + Preload + React Renderer）
- **核心分层**：Main 负责“引擎/调度/文件系统/IPC”；Renderer 负责“UI/交互”；Preload 负责“安全桥”
- **目标参考**：类似 WorkBuddy 的桌面协作/对话类应用（不要求 UI 复刻）

## 当前产品主线（What / Why）

ClawFlow 的核心主线是 **“以工作区（Workspace）为单位，把模型工具（tools）能力开关、文件/会话/调度数据持久化，并在 UI 中形成可操作闭环”**。

## 目标（Goals）

- **P0（已在做）**：对话闭环 + 工作区能力治理（`.tool/manifest.json` 过滤可用工具）
- **P1（阶段 3 起）**：模型可调度的待办（IPC + 持久化 + 调度 + UI 刷新）、子 Agent 槽位最小状态
- **P2**：**自主进化型 Skills（Hermes 式）** 的应用内管线（发现、版本、启用策略；非 OpenClaw 技能市场）；知识库（向量/路径）与检索工具（RAG）

## 非目标（Non-goals）

- 不追求复刻任何第三方 UI
- 不在 Renderer 直接开放 Node / FS 权限（保持 `contextIsolation` 与 IPC 边界）
- 子 Agent 暂不实现真实“委派执行/并行调度”，本阶段只做 **slots 元数据 + IPC 同步**

## 关键约束（Constraints）

- **安全边界**：Renderer 只能通过 `window.electronAPI` 调用主进程；敏感操作集中在 Main
- **工作区隔离**：工作区相关数据写入 `${WORKSPACE_ROOT}/.clawflow/` 与 `${WORKSPACE_ROOT}/.tool/`
- **工具治理**：模式（Plan/Multitask 等）下，工具 schema 在发送模型前会按 `.tool/manifest.json` 过滤；执行阶段再次校验防止历史轮次误调用

## 术语表（Glossary）

- **Workspace**：用户选定的工作区根目录
- **Tool Runtime**：主进程注册的“模型工具”集合（见 `src/engine/tool-runtime.ts`）
- **Workspace Manifest**：`${WORKSPACE_ROOT}/.tool/manifest.json`（工具能力开关）
- **Todo Triggers**：`${WORKSPACE_ROOT}/.clawflow/todo-triggers.v1.json`（待办调度数据）
- **Sub-agent slots**：`${WORKSPACE_ROOT}/.clawflow/sub-agents.v1.json`（子 Agent 槽位数据）

## 单一事实来源（Source of Truth）

- `03_PRD.md`：本轮重整理的 PRD（含“证据”）
- `02_ARCHITECTURE.md`：架构与关键调用链
- `06_TASKS.md`：按模块拆分的待办与验收

