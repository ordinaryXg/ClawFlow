# 工作区工具

| 字段 | 值 |
|------|-----|
| **功能 ID** | `workspace-tools` |
| **状态** | 已落地 |
| **完成度** | 88% |
| **优先级** | P0 |
| **最后更新** | 2026-07-21 |

## 1. 功能概述

模型可调用的内置工具集，按工作区 manifest 能力 ID 门控。注册于 `createDefaultToolRuntime()`，执行经 `ToolRuntime` 类，路径校验在工作区根内完成。

## 2. 用户场景

1. 用户在设置 account 勾选工具能力 → 写入 `${WORKSPACE}/.agent/.tool/manifest.json`
2. 对话中模型发起 tool_call → 引擎过滤 schema → 运行时二次校验 → 执行
3. 高风险操作弹出审批栏 → 用户确认后继续

## 3. 实现进度

### 已落地

- [x] **36** 个内置 `function.name`（当前代码快照）
- [x] Manifest v2 九项能力：`docs` | `git` | `shell` | `web_search` | `web_scrape` | `scheduling` | `skills` | `knowledge_base` | `feishu`
- [x] 发模型前 schema 过滤 + 执行二次校验
- [x] 工具结果截断与去重
- [x] `get_date`（无 manifest 门控）

### 部分落地

- [ ] manifest 说明 md 仅 `writeIfMissing`，不自动刷新旧文案

### 已移除

- [x] `workspace_subagent_*`、OpenClaw 技能市场相关工具

## 4. 架构与数据

### 按能力域工具清单

| Manifest ID | 工具（节选） |
|-------------|-------------|
| `docs` | `workspace_list_dir`、`workspace_read_file`、`workspace_write_file`、`workspace_apply_patch*`、`workspace_mkdir`、`workspace_rename_path`、`workspace_delete_path`、`workspace_rollback_op` |
| `shell` | `workspace_run_shell`、`workspace_run_tsc_no_emit` |
| `git` | `workspace_git_status`、`workspace_git_diff`、`workspace_git_log` |
| `web_search` | `web_search`、`workspace_rg_search` |
| `web_scrape` | `web_scrape` |
| `scheduling` | `workspace_schedule_*`（4 个） |
| `skills` | `workspace_skill_*`（5 个） |
| `knowledge_base` / memory | `hermes_search`、`hermes_memory_*`、`workspace_memory_rebuild_index` |
| `feishu` | `workspace_feishu_invoke` |

契约正文：`src/shared/workspace-tool-docs/*.md`

## 5. 入口与代码证据

| 类型 | 路径 / 符号 |
|------|-------------|
| 注册表 | `engine/tool-runtime/default-tools/`（`index.ts` + `register-*-tools.ts`） |
| 运行时类 | `engine/tool-runtime/tool-runtime-core.ts` |
| Manifest 桥接 | `shared/workspace-tool-manifest-bridge.ts` |
| 能力 ID | `shared/workspace-tools.ts` |
| Shell 执行 | `engine/tool-runtime/workspace-shell-exec.ts` |
| 补丁 | `engine/tool-runtime/apply-patch.ts` |
| 审批 UI | `components/chat/ToolApprovalBar.tsx` |

## 6. 关联文档

- [workspace.md](./workspace.md) — manifest 路径与初始化
- [web-scrape.md](./web-scrape.md) — `web_scrape` 详情
- [feishu.md](./feishu.md) — `workspace_feishu_invoke`
- [hermes-memory.md](./hermes-memory.md) — `hermes_search` 等
