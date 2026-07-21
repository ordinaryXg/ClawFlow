# Hermes 记忆与检索

| 字段 | 值 |
|------|-----|
| **功能 ID** | `hermes-memory` |
| **状态** | 已落地 |
| **完成度** | 85% |
| **优先级** | P0 |
| **最后更新** | 2026-07-21 |

## 1. 功能概述

基于 SQLite FTS 的工作区记忆索引：自动索引 Markdown/文本文件，提供语义检索工具 `hermes_search`，逻辑路径前缀为 `.agent/.hermes/memory/`（无独立 notes 磁盘目录）。

## 2. 用户场景

1. 打开工作区 → 增量 FTS 同步（`refreshHermesMemoryIndexBestEffort`）
2. 对话中模型调用 `hermes_search` 检索相关记忆
3. 设置 memory 分区：FTS 搜索测试、全量重建索引
4. 模型通过 `hermes_memory_upsert/delete/list` 管理记忆条目

## 3. 实现进度

### 已落地

- [x] SQLite FTS 索引（`hermes-memory.db`）
- [x] 自动索引工作区文本树 + 对话归档钩子
- [x] **`hermes_search`** 为主检索工具（Markdown 命中）
- [x] `hermes_memory_upsert/delete/list`
- [x] `workspace_memory_rebuild_index` 全量重建
- [x] IPC：`memoryFts:search`、`memoryFts:rebuild`
- [x] Deprecated 别名仍可用：`workspace_knowledge_query`、`workspace_memory_search`

### 已落地（向量 RAG）

- [x] sqlite-vec 向量表 + Embedding API（Ollama / OpenAI 兼容）
- [x] FTS + 向量混合检索（`hermes_search` / Hub / 设置页测试）
- [x] 全量重建与增量补写向量（FTS 同步、memory upsert/delete 后）
- [x] Embedding 偏好持久化 + `memoryFts:getIndexStatus`

### 部分落地

- [ ] 记忆存储 60%：缺用户手动创建笔记独立流程

### 未实现 / 待完善

- [ ] 记忆分类（项目/学习/工作/个人）
- [ ] 按时间/分类过滤、搜索结果高亮
- [ ] 记忆重要性标记、知识图谱关联

## 4. 架构与数据

| 路径 | 用途 |
|------|------|
| `${WORKSPACE}/.agent/.hermes/index/hermes-memory.db` | FTS 数据库 |
| `.agent/.hermes/memory/` | 记忆逻辑路径前缀 |
| 索引钩子 | `engine/hermes/hermes-memory-index-hooks.ts` |

## 5. 入口与代码证据

| 类型 | 路径 / 符号 |
|------|-------------|
| DB | `engine/hermes/hermes-memory-db.ts` |
| 存储 | `engine/hermes/hermes-memory-store.ts` |
| 服务 | `engine/hermes/hermes-memory-service.ts` |
| 嵌入 | `engine/hermes/hermes-memory-embeddings.ts` |
| 设置 UI | `pages/SettingsPage/MemorySettingsPanel.tsx` |

## 6. 关联文档

- [knowledge-base.md](./knowledge-base.md) — 知识库 FTS Phase 1
- [workspace-tools.md](./workspace-tools.md) — 检索工具列表
- [engineering/performance.md](../engineering/performance.md) — 索引性能
