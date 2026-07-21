# ClawFlow 功能总览

> 每个功能独立维护一份文档，模板见 [conventions.md](../conventions.md)。  
> 历史评估快照见 [reviews/feature-completeness-2026-06-02.md](../reviews/feature-completeness-2026-06-02.md)。

## 完成度总表

| 功能 ID | 名称 | 状态 | 完成度 | 文档 |
|---------|------|------|--------|------|
| `workspace` | 工作区生命周期 | 已落地 | 85% | [workspace.md](./workspace.md) |
| `chat-engine` | 对话与引擎 | 已落地 | 90% | [chat-engine.md](./chat-engine.md) |
| `workspace-tools` | 工作区工具 | 已落地 | 88% | [workspace-tools.md](./workspace-tools.md) |
| `scheduling` | 周期调度 | 已落地 | 85% | [scheduling.md](./scheduling.md) |
| `hermes-skills` | Hermes 技能 | 已落地 | 75% | [hermes-skills.md](./hermes-skills.md) |
| `hermes-memory` | Hermes 记忆与检索 | 已落地 | 70% | [hermes-memory.md](./hermes-memory.md) |
| `knowledge-base` | 知识库 | 部分落地 | 40% | [knowledge-base.md](./knowledge-base.md) |
| `system-agents` | 系统子 Agent | 已落地 | 75% | [system-agents.md](./system-agents.md) |
| `web-scrape` | 网页抓取 | 已落地 | 70% | [web-scrape.md](./web-scrape.md) |
| `gateway` | Gateway 通信 | 已落地 | 90% | [gateway.md](./gateway.md) |
| `feishu` | 飞书集成 | 已落地 | 80% | [feishu.md](./feishu.md) |
| `sticky-shell` | 便签壳 / 卫星窗 | 已落地 | 85% | [sticky-shell.md](./sticky-shell.md) |
| `shell-ui` | 壳层与全局体验 | 已落地 | 80% | [shell-ui.md](./shell-ui.md) |

## 已移除能力

| 能力 | 说明 |
|------|------|
| 工作区委派子 Agent | 打开工作区时清理遗留 `.subagent/`；UI 已移除 |
| OpenClaw 技能市场 | 由 Hermes `.agent/.skills/` + `/skills` 页替代 |

## 代码证据速查

| 功能 | 关键符号 / 路径 |
|------|-----------------|
| 工具注册 | `createDefaultToolRuntime()` → `tool-runtime-default-tools/` |
| ToolRuntime 类 | `tool-runtime-core.ts` |
| Gateway 客户端 | `store/modules/chat-gateway-client.ts` |
| Manifest 桥接 | `workspace-tool-manifest-bridge.ts` |
| 工作区激活 | `applyActiveWorkspace()` → `active-workspace-sync.ts` |
| 周期调度 | `main/scheduling/`、`shared/schedule-triggers.ts` |
| 引擎 IPC | `registerClawFlowIPC()` → `engine-ipc.ts` |
| 主进程 IPC | `main/ipc/register-*.ts`、`workspace-ipc.ts` |

**维护约定**：新增 IPC、工具名或 `${WORKSPACE}` 目录时，同步更新对应 feature 文档与 [engineering/architecture.md](../engineering/architecture.md)。
