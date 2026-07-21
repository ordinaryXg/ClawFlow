# Hermes 技能

| 字段 | 值 |
|------|-----|
| **功能 ID** | `hermes-skills` |
| **状态** | 已落地 |
| **完成度** | 75% |
| **优先级** | P0 |
| **最后更新** | 2026-07-21 |

## 1. 功能概述

工作区内的 Hermes 技能包系统：技能存放在 `${WORKSPACE}/.agent/.skills/`，支持模型工具读写、Hub 轻量面板与全页浏览器、新建工作区自动安装 `skill-creator` v2。

## 2. 用户场景

1. 新建工作区 → 自动 bootstrap `skill-creator` 与 `lark-cli` 技能包
2. Hub `skills` 分支快速查看 → `/skills` 全页深度编辑
3. 对话中模型调用 `workspace_skill_*` 创建/修改技能
4. 多轮使用后触发 deduce-evolution 技能进化（见 [system-agents.md](./system-agents.md)）

## 3. 实现进度

### 已落地

- [x] 技能发现、启用状态、文件读写
- [x] 模型工具 5 个：`workspace_skill_view/create/patch/write_aux/delete`
- [x] IPC：`workspaceSkills:*`
- [x] UI：`SkillsPage`、`SkillsHubPanel`、`HermesSkillsBrowser`
- [x] 新建工作区安装 skill-creator v2（既有目录非空不覆盖）
- [x] 内容校验（`skills-guard.ts`）

### 部分落地

- [ ] 技能使用统计 UI
- [ ] 版本回滚机制

### 未实现 / 待完善

- [ ] 技能市场 / 远程安装
- [ ] 自动进化提示词优化的可视化对比

## 4. 架构与数据

| 路径 | 用途 |
|------|------|
| `${WORKSPACE}/.agent/.skills/<name>/` | 技能包（SKILL.md、_meta.json 等） |
| `${WORKSPACE}/.agent/.evolution/` | 进化运行记录 |

## 5. 入口与代码证据

| 类型 | 路径 / 符号 |
|------|-------------|
| Bootstrap | `main/workspace/workspace-hermes-skill-bootstrap.ts` |
| 读写 | `main/workspace/workspace-skills-read.ts` |
| Manifest | `main/workspace/workspace-skill-manifest.ts` |
| 进化调度 | `main/skill/skill-evolution-scheduler.ts` |
| UI | `pages/SkillsPage/`、`components/workspace-hub/SkillsHubPanel.tsx` |

## 6. 关联文档

- [system-agents.md](./system-agents.md) — deduce-evolution
- [workspace-tools.md](./workspace-tools.md) — 技能工具列表
- [product/ux-prototype.md](../product/ux-prototype.md) — Hub vs `/skills` 分工
