# ClawFlow 项目总览（AI 快速接入）

## 基本信息

- **仓库根目录**：`${REPO_ROOT}`
- **应用形态**：Electron 桌面应用（Main + Preload + React Renderer）
- **核心依赖**：主进程内置 **ClawFlowEngine**、**GatewayDaemon** 与相关 IPC；**不要求、不依赖** OpenClaw CLI（无外置 `openclaw` 可执行文件）
- **目标参考**：类似腾讯 WorkBuddy 的桌面协作/对话类应用（**不要求 UI 复刻**）

## 目标（Goals）

- **P0**：对话能力可用（含流式响应呈现）、基础技能管理、连接器管理、Gateway 启停与状态展示
- **P1**：设置页（主题/语言/行为配置）、稳定性与错误处理、基本测试与构建可用性
- **P2+**：CI、发布、签名更新、更完整的用户/开发文档

## 非目标（Non-goals）

- **不追求**：完全复刻 WorkBuddy 的 UI/信息架构
- **不默认**：把所有 OpenClaw 细节都暴露给 Renderer（优先保证安全边界与最小 API）

## 关键约束（Constraints）

- **安全边界**：`contextIsolation: true`，Renderer 不直接拥有 Node 权限，统一走 `preload` 暴露的受控 API
- **环境依赖**：各模型 Provider 的可用凭证（应用内配置或环境变量）；**不要求**安装 OpenClaw CLI
- **跨平台**：文档与脚本避免硬编码盘符路径；文档统一用 `${REPO_ROOT}`

## 术语表（Glossary）

- **ClawFlowEngine**：内置对话与工具运行时，经 IPC 暴露给渲染进程
- **GatewayDaemon**：应用内置本地 HTTP/WebSocket 网关（启停与状态经 IPC）
- **IPC**：Electron 进程间通信（Renderer ↔ Preload ↔ Main）
- **Renderer**：React UI 运行的渲染进程

## 当前“单一事实来源”（Source of Truth）

- **架构**：`02_ARCHITECTURE.md`
- **任务清单**：`06_TASKS.md`
- **工作流程**：`05_DEV_PROCESS.md`
- **索引入口**：`00_INDEX.md`

## 近期优先工作（给 AI/人类的执行入口）

> 以 `06_TASKS.md` 的 P0/P1 优先级为准；若二者冲突，以“更接近可交付产品”的路径为准（对话 → 技能/连接器 → 设置 → 稳定性/测试 → 发布）。

