# 工作区生命周期

| 字段 | 值 |
|------|-----|
| **功能 ID** | `workspace` |
| **状态** | 已落地 |
| **完成度** | 85% |
| **优先级** | P0 |
| **最后更新** | 2026-07-21 |

## 1. 功能概述

工作区是 ClawFlow 的核心边界：用户将本地文件夹挂载为工作区后，Agent 的文件操作、记忆索引、技能包、工具 manifest 均限定在该目录内。支持多工作区注册与切换，应用启动时不自动绑定工作区。

## 2. 用户场景

1. 侧栏 **添加文件夹** 或 **新建工作区** → 激活后自动初始化 `.agent/` bundle
2. 在多个项目间切换 → 引擎与会话上下文随工作区隔离
3. Git Pull/Push、重置工作区缓存（保留 `.clawflow-data/` 调度数据）
4. 右栏浏览文件树、预览、拖放文件到聊天

## 3. 实现进度

### 已落地

- [x] 注册、删除、切换工作区（`workspace:setActive` → `applyActiveWorkspace`）
- [x] 最近列表持久化（`userData/cf.workspace.v1.json`）
- [x] 打开/激活时 `ensureWorkspaceInitialized()`（stash、`.agent`、manifest、角色模板、知识库目录、skill-creator）
- [x] 工具 manifest v2（9 项能力 ID，`workspace-tools.ts`）
- [x] Git Pull/Push（`workspace:gitPull`、`workspace:gitPush`）
- [x] 资源管理器 IPC（列目录、读写、mkdir/rename/delete）
- [x] 变更日志（`workspace:getChangeLog`）
- [x] 聊天拖放（`workspace:copyChatDropFiles`）
- [x] 路径沙箱与安全过滤

### 部分落地

- [ ] 工作区模板（React/Python/Node 等）— 仅基础新建流程
- [ ] Git Commit 创建 UI、冲突解决、Diff 视图

### 未实现 / 待完善

- [ ] 大文件预览优化
- [ ] 文件差异对比（Diff view）

## 4. 架构与数据

### 工作区目录约定（`${WORKSPACE}`）

| 路径 | 用途 |
|------|------|
| `.agent/.roleAgent/` | 主 Agent 角色 md |
| `.agent/.tool/` | manifest + 工具契约 md |
| `.agent/.skills/` | Hermes 技能包 |
| `.agent/.knowledge/` | 用户策展知识库 |
| `.agent/.hermes/index/` | Hermes SQLite |
| `.agent/.hermes/memory/` | 记忆逻辑路径（仅存索引） |
| `.agent/.evolution/` | 进化运行记录 |
| `.agent/.clawflow/` | 会话元数据、scrapes |
| `.clawflow-data/` | 周期调度（重置 `.agent` 时保留） |
| 应用缓存 `workspaces/<hash>/` | `.clawflow-launcher-stash/` |

## 5. 入口与代码证据

| 类型 | 路径 / 符号 |
|------|-------------|
| IPC | `main/ipc/workspace-ipc.ts` |
| 切换同步 | `main/workspace/active-workspace-sync.ts` |
| 注册表 | `main/workspace/workspace-service.ts` |
| 初始化 | `ensureWorkspaceInitialized()` |
| 渲染层 | `store/modules/workspaceStore.ts`、`WorkspaceSidebar.tsx` |
| Git | `main/workspace/workspace-git.ts` |
| 资源管理器 | `main/workspace/workspace-explorer.ts` |

## 6. 关联文档

- [workspace-tools.md](./workspace-tools.md) — 工具 manifest 与能力开关
- [hermes-memory.md](./hermes-memory.md) — Hermes 索引目录
- [engineering/architecture.md](../engineering/architecture.md) — IPC 与数据落盘
- [product/ux-prototype.md](../product/ux-prototype.md) — 侧栏与 Hub
