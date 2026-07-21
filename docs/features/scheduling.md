# 周期调度

| 字段 | 值 |
|------|-----|
| **功能 ID** | `scheduling` |
| **状态** | 已落地 |
| **完成度** | 85% |
| **优先级** | P0 |
| **最后更新** | 2026-07-21 |

## 1. 功能概述

在工作区内创建定时/周期任务（once / interval / cron），到点后向聊天注入消息或触发模型执行。数据独立于 `.agent/`，存于 `.clawflow-data/`，重置工作区缓存时不删除。

## 2. 用户场景

1. Hub `scheduling` 分支或便签壳 Tab 打开 `SchedulingPanel`
2. 创建 trigger（cron 表达式或间隔）
3. 到点 → Toast 通知 → 可选 `submitToModel` 注入聊天
4. 模型也可通过 `workspace_schedule_*` 工具管理调度

## 3. 实现进度

### 已落地

- [x] once / interval / cron 三种触发类型
- [x] 模型工具：`workspace_schedule_list/create/update/remove`
- [x] 持久化：`${WORKSPACE}/.clawflow-data/schedule-triggers.v1.json`
- [x] 调度器：`schedule-triggers-scheduler.ts`
- [x] IPC：`scheduleTriggers:*`、事件 `schedule-trigger:fired`
- [x] UI：`SchedulingPanel`、`SchedulingStickyFloat`
- [x] 到点通道 `user_scheduling_auto`（不计入 Skill 进化轮次）

### 未实现 / 待完善

- [ ] 更丰富触发类型
- [ ] 批量管理 UI

## 4. 架构与数据

| 路径 | 内容 |
|------|------|
| `${WORKSPACE}/.clawflow-data/schedule-triggers.v1.json` | 触发器记录 |
| 变更日志 | `schedule_added` / `schedule_triggered` 事件 |

## 5. 入口与代码证据

| 类型 | 路径 / 符号 |
|------|-------------|
| 服务 | `main/scheduling/schedule-triggers-service.ts` |
| 调度器 | `main/scheduling/schedule-triggers-scheduler.ts` |
| 类型 | `shared/schedule-triggers.ts` |
| IPC | `main/ipc/register-scheduling-scrape-ipc.ts` |
| Store | `store/modules/scheduleTriggerStore.ts` |

## 6. 关联文档

- [workspace-tools.md](./workspace-tools.md) — 调度工具
- [chat-engine.md](./chat-engine.md) — 到点注入聊天
- [shell-ui.md](./shell-ui.md) — Hub scheduling 分支
