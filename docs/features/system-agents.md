# 系统子 Agent

| 字段 | 值 |
|------|-----|
| **功能 ID** | `system-agents` |
| **状态** | 已落地 |
| **完成度** | 75% |
| **优先级** | P1 |
| **最后更新** | 2026-07-21 |

## 1. 功能概述

应用级系统 Agent 三槽位，存储于应用缓存 `{appCache}/system/`，不写入用户 Git 仓库。负责对话模式分类、预期规划、技能 deduce-evolution 进化。

## 2. 用户场景

1. 发送消息前 → 认知分配建议 ask/plan/multitask（可关）
2. 复杂任务 → 预期规划生成 Markdown 注入主上下文
3. 主对话累计 `totalUserManualRounds` → 触发技能进化三阶段流水线
4. 设置 `agents` 分区配置模型覆盖与开关

## 3. 实现进度

### 已落地

- [x] `cf-cognitive-allocation` — M1–M5 → 模式建议
- [x] `cf-expectation-planning` — 规划 Markdown
- [x] `cf-skill-agent` — deduce-evolution 进化
- [x] IPC：`systemAgents:*`
- [x] UI：`SystemAgentsSettingsPanel`、`ExpectationPlanningPanel`
- [x] 进化状态：`${WORKSPACE}/.agent/.evolution/skill-evolution-state.v1.json`

### 部分落地

- [ ] 进化可视化与回滚 UI
- [ ] 各 Agent 独立性能监控

### 未实现 / 待完善

- [ ] 用户自定义系统 Agent 槽位
- [ ] 进化 A/B 对比报告

## 4. 架构与数据

| 槽位 | 调度时机 |
|------|----------|
| 认知分配 | 每次发送前（可关） |
| 预期规划 | 复杂度启发式 |
| 技能进化 | `skill-evolution-scheduler.ts` 轮次间隔 |

## 5. 入口与代码证据

| 类型 | 路径 / 符号 |
|------|-------------|
| IPC | `main/system-agents/system-agents-ipc.ts` |
| 运行器 | `main/system-agents/system-sub-agent-runner.ts` |
| 进化流水线 | `main/skill/skill-evolution-pipeline.ts` |
| 预期规划 | `main/system-agents/expectation-planning-agent.ts` |
| 认知分配 | `main/system-agents/cognitive-allocation-agent.ts` |
| 设置 | `pages/SettingsPage/SystemAgentsSettingsPanel.tsx` |

## 6. 关联文档

- [chat-engine.md](./chat-engine.md) — 发送前管线
- [hermes-skills.md](./hermes-skills.md) — 进化目标
- [product/ux-prototype.md](../product/ux-prototype.md) — 设置 agents 分区
