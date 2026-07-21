# Gateway 通信

| 字段 | 值 |
|------|-----|
| **功能 ID** | `gateway` |
| **状态** | 已落地 |
| **完成度** | 90% |
| **优先级** | P0 |
| **最后更新** | 2026-07-21 |

## 1. 功能概述

本地 Gateway 守护进程（HTTP + WebSocket，默认端口 **18789**），是桌面端**聊天主路径**：渲染层经 WS 发送 `chat:send`，接收流式 `chat:delta` / `chat:final` 与工具审批帧。

## 2. 用户场景

1. 应用启动 → 设置 integrations 启停 Gateway
2. `chat-gateway-client.ts` 连接 `ws://127.0.0.1:<port>/ws`
3. 发送消息 → 流式接收 → 工具审批经 WS 响应
4. 调试：Gateway 日志面板查看守护进程输出

## 3. 实现进度

### 已落地

- [x] Gateway 守护进程（`gateway-daemon.ts`）
- [x] IPC：`engineGateway:status|start|stop|restart|logs`
- [x] WS 协议：`chat:send`、`chat:delta`、`chat:final`、`chat:toolApproval`、`chat:toolApprovalResponse`
- [x] UI：`gatewayStore`、设置 integrations 分区
- [x] 聊天必须先 `engineGatewayStart` 再连 WS

### 部分落地

- [ ] 设置页/help 中「双通道」说明文档化（Gateway vs IPC 回退）

### 未实现 / 待完善

- [ ] 远程引擎连接（架构预留，未实现）
- [ ] Gateway 认证与多客户端隔离

## 4. 架构与数据

```
Renderer (chat-gateway-client.ts)
    ↕ WebSocket
GatewayDaemon (gateway-daemon.ts)
    ↕
ClawFlowEngine (clawflow-engine.ts)
```

## 5. 入口与代码证据

| 类型 | 路径 / 符号 |
|------|-------------|
| 守护进程 | `engine/gateway/gateway-daemon.ts` |
| IPC 注册 | `registerGatewayIPC()` |
| 客户端 | `store/modules/chat-gateway-client.ts` |
| Store | `store/modules/gatewayStore.ts` |
| Preload | `engineGateway:*`（`preload.ts`） |

## 6. 关联文档

- [chat-engine.md](./chat-engine.md) — 聊天主路径
- [engineering/architecture.md](../engineering/architecture.md) — 通信分层
- 根目录 [README.md](../../README.md) — 聊天传输表格
