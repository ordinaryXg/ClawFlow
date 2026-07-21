# 对话与引擎

| 字段 | 值 |
|------|-----|
| **功能 ID** | `chat-engine` |
| **状态** | 已落地 |
| **完成度** | 90% |
| **优先级** | P0 |
| **最后更新** | 2026-07-21 |

## 1. 功能概述

ClawFlow 的对话核心：多会话管理、多模型 Provider 路由、Ask/Plan/Multitask 三模式、Tool Loop、工具审批、流式输出。桌面端主路径经 Gateway WebSocket；无 Gateway 时回退 `engine:sendMessage`。

## 2. 用户场景

1. 创建会话 → 选择模型与模式 → 输入消息
2. 发送前可选认知分配 + 预期规划（系统 Agent）
3. Gateway 流式接收 `chat:delta` / `chat:final`
4. 工具调用循环 → 高风险工具弹出 `ToolApprovalBar`
5. 查看上下文占用环（非账单 token 当量）

## 3. 实现进度

### 已落地

- [x] 多模型（DeepSeek / OpenAI / Anthropic）
- [x] 三交互模式：`ask` | `plan` | `multitask`
- [x] Gateway WS 流式（`chat-gateway-client.ts`）
- [x] IPC 回退（`engine:sendMessage` + reveal 动画）
- [x] 会话 CRUD（`engine:getConversations` 等）
- [x] Tool Loop + 工具审批（WS `chat:toolApproval`）
- [x] Reasoning 独立展示（DeepSeek Reasoner）
- [x] 可中断生成、发送队列（`PendingSendQueue`）
- [x] 上下文估算（`engine:estimateNextRequestContext`）
- [x] Web 搜索工具集成

### 部分落地

- [ ] 对话管理 80%：缺导出与分支

### 未实现 / 待完善

- [ ] 对话导出（Markdown/JSON）
- [ ] 对话分支管理
- [ ] 多模型对比模式
- [ ] 对话模板保存
- [ ] `engine:sendMessageStream` / `engine:chatStream` 与 UI 未对齐（有意保留 IPC 回退）

## 4. 架构与数据

### 聊天传输路径

| 路径 | 何时 | 实现 |
|------|------|------|
| **主路径** | Electron 且具备 `engineGateway*` | `chat-gateway-client.ts` → WS `chat:send` / `chat:delta` / `chat:final` |
| **回退** | 无 WebSocket 或 Gateway IPC | `engine:sendMessage`（非流式 + reveal） |

### 发送前系统 Agent

| 功能 | IPC |
|------|-----|
| 认知分配 | `systemAgents:classifyConversation` |
| 预期规划 | `systemAgents:planExpectation` + `systemAgents:expectationPlanDelta` |

## 5. 入口与代码证据

| 类型 | 路径 / 符号 |
|------|-------------|
| 引擎 | `engine/core/clawflow-engine.ts` |
| 引擎 IPC | `engine/core/engine-ipc.ts` |
| Gateway 客户端 | `store/modules/chat-gateway-client.ts` |
| 状态 | `store/modules/chatStore.ts`（入口）+ `store/modules/chat-store/` |
| 出站编排 | `store/modules/chat-outbound-orchestrator.ts` |
| UI | `pages/ChatPage/`、`components/chat/*` |
| Provider | `engine/core/provider-router.ts`、`engine/providers/*` |
| 模式分类 | `engine/mode/conversation-mode-classifier.ts` |

## 6. 关联文档

- [gateway.md](./gateway.md) — WebSocket 主路径
- [system-agents.md](./system-agents.md) — 认知分配与预期规划
- [workspace-tools.md](./workspace-tools.md) — Tool Loop 工具集
- [engineering/architecture.md](../engineering/architecture.md) — 引擎分层
