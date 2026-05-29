# ClawFlow / AICodeFile 文档索引（以代码为准）

> 目标：让人和 AI 在 1–3 分钟内定位到 **产品是什么 / 已落地什么 / 代码在哪里**。

## 推荐阅读顺序

1. `产品原型.md` — 信息架构、双壳层、页面与关键用户旅程；文末 **附录 A：原型改进建议**
2. `代码架构.md` — 进程分层、目录、IPC、数据落盘、引擎与 Hermes
3. `功能说明.md` — 能力清单（已落地 / 部分 / 未实现 + 证据速查）

协作者速查另见仓库根目录 `README.md`（含 **聊天传输**：Gateway WS 主路径、`engine:sendMessage` 回退）。

## 文件地图

| 文件 | 说明 |
|------|------|
| `00_INDEX.md` | 本索引 |
| `产品原型.md` | 产品原型（UI 壳层、路由、Hub、用户旅程、**附录 A 改进建议**） |
| `代码架构.md` | 代码架构（主/渲染/引擎、IPC 模块、存储布局） |
| `功能说明.md` | 功能说明（能力域清单与实现状态） |

## 统一约定

- **以代码为单一事实来源**：每个“已实现/未实现”判断应能对应到文件路径 + 关键函数/IPC/类型名。
- **路径占位符**：`${REPO_ROOT}` = 仓库根目录；`${WORKSPACE}` = 用户选定的工作区根目录。
- **功能状态分类**：
  - **已落地**：有代码路径 + 可触发入口（UI / IPC / Tool）+ 类型或数据模型
  - **部分落地**：有代码/类型，但缺向量 RAG、部分渠道等完整验收
  - **未实现**：仅有占位或设想，无运行路径
- **聊天主路径**：桌面端 `chat-gateway-client.ts` → Gateway WebSocket；勿按 `engine:chatStream` 验收流式 UI。

## 近期文档修订要点（与代码对齐）

- 流式/审批改为 **Gateway WS** 描述；`engine:sendMessageStream` 标为 UI 未用。
- UI 已落地：`SendPipelineStatusBar`、上下文环「非账单 token」文案、知识库 FTS 状态文案。
- Hermes 检索以 **`hermes_search`** 为主；知识库为 **FTS Phase 1 已落地**。
- `tool-runtime` 拆分为 `tool-runtime-core.ts` + `tool-runtime-default-tools.ts`。
- 工作区切换统一写 **`applyActiveWorkspace`** / `workspace:setActive`。
