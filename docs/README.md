# ClawFlow 文档索引

> 目标：让人和 AI 在 1–3 分钟内定位到 **产品是什么 / 已落地什么 / 代码在哪里**。  
> 规范详见 [conventions.md](./conventions.md)。

---

## 推荐阅读顺序

1. [product/ux-prototype.md](./product/ux-prototype.md) — 信息架构、双壳层、页面与用户旅程
2. [engineering/architecture.md](./engineering/architecture.md) — 进程分层、目录、IPC、数据落盘
3. [features/README.md](./features/README.md) — **各功能独立文档**（概述 + 实现进度）
4. 根目录 [README.md](../README.md) — 协作者代码入口（构建、IPC 约定、聊天传输）

---

## 文档地图

### 规范与索引

| 文件 | 说明 |
|------|------|
| [conventions.md](./conventions.md) | 命名、模板、状态定义、维护约定 |
| [features/README.md](./features/README.md) | 功能总览与完成度表 |

### 产品（product/）

| 文件 | 说明 |
|------|------|
| [product/prd.md](./product/prd.md) | 产品需求文档（PRD） |
| [product/ux-prototype.md](./product/ux-prototype.md) | UI 原型、Hub、用户旅程、附录 A 改进建议 |

### 工程（engineering/）

| 文件 | 说明 |
|------|------|
| [engineering/architecture.md](./engineering/architecture.md) | 代码架构（以当前代码为准） |
| [engineering/performance.md](./engineering/performance.md) | 性能基线与优化方案 |

### 功能（features/）

每个功能一份独立文档，含**功能描述 + 实现进度 + 代码证据**：

| 功能 ID | 文档 | 状态 |
|---------|------|------|
| `workspace` | [features/workspace.md](./features/workspace.md) | 已落地 |
| `chat-engine` | [features/chat-engine.md](./features/chat-engine.md) | 已落地 |
| `workspace-tools` | [features/workspace-tools.md](./features/workspace-tools.md) | 已落地 |
| `scheduling` | [features/scheduling.md](./features/scheduling.md) | 已落地 |
| `hermes-skills` | [features/hermes-skills.md](./features/hermes-skills.md) | 已落地 |
| `hermes-memory` | [features/hermes-memory.md](./features/hermes-memory.md) | 已落地 |
| `knowledge-base` | [features/knowledge-base.md](./features/knowledge-base.md) | 部分落地 |
| `system-agents` | [features/system-agents.md](./features/system-agents.md) | 已落地 |
| `web-scrape` | [features/web-scrape.md](./features/web-scrape.md) | 已落地 |
| `gateway` | [features/gateway.md](./features/gateway.md) | 已落地 |
| `feishu` | [features/feishu.md](./features/feishu.md) | 已落地 |
| `sticky-shell` | [features/sticky-shell.md](./features/sticky-shell.md) | 已落地 |
| `shell-ui` | [features/shell-ui.md](./features/shell-ui.md) | 已落地 |

### 评估快照（reviews/）

| 文件 | 说明 |
|------|------|
| [reviews/feature-completeness-2026-06-02.md](./reviews/feature-completeness-2026-06-02.md) | 2026-06-02 功能完成度评估（历史快照） |

---

## 统一约定速查

- **单一事实来源**：每个「已实现/未实现」判断应对应文件路径 + IPC/函数名
- **聊天主路径**：`chat-gateway-client.ts` → Gateway WebSocket；勿按 `engine:chatStream` 验收流式 UI
- **工作区切换**：`applyActiveWorkspace` / `workspace:setActive`
- **工具注册**：`createDefaultToolRuntime()` → `tool-runtime-default-tools/`（约 36 个工具名）

---

**维护**：新增功能时创建 `docs/features/<id>.md` 并更新本索引与 [features/README.md](./features/README.md)。
