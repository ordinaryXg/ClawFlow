# 知识库

| 字段 | 值 |
|------|-----|
| **功能 ID** | `knowledge-base` |
| **状态** | 部分落地 |
| **完成度** | 65% |
| **优先级** | P1 |
| **最后更新** | 2026-07-21 |

## 1. 功能概述

用户策展的知识库系统：索引 `.agent/.knowledge/**`、`.agent/.skills/**` 及 Hermes 记忆逻辑路径。Phase 1 基于 FTS；Phase 2 混合向量 RAG（sqlite-vec + Embedding API）已接入检索与索引闭环。

## 2. 用户场景

1. Hub `kb` 分支或便签壳 `kb` Tab 打开 `KnowledgeBaseHubPanel`
2. FTS / 混合检索、浏览清单、新建笔记
3. 从工作区文件摄入（`knowledge:ingestFile`）
4. 模型通过 `hermes_search` / deprecated 别名检索（返回 `hybridUsed`）

## 3. 实现进度

### 已落地（Phase 1）

- [x] 索引 `.agent/.knowledge/**` 与相关路径
- [x] 清单 `${WORKSPACE}/.agent/.knowledge/knowledge-manifest.json`
- [x] Hub UI：检索、新建笔记、列表
- [x] IPC：`knowledge:listManifest`、`knowledge:createNote`、`knowledge:ingestFile`
- [x] 便签壳 `kb` Tab 嵌入同一 Hub 面板

### 已落地（Phase 2 — 向量 RAG 闭环）

- [x] sqlite-vec 向量表 + Ollama / OpenAI 兼容 Embedding
- [x] FTS + 向量混合检索（`mergeHybridHermesHits`，可调 α）
- [x] 全量重建写入向量（`memoryFts:rebuild` → `embedded` 计数）
- [x] 增量 FTS 同步后补写缺失向量（`refreshHermesMemoryIndexAsync`）
- [x] `hermes_memory_upsert/delete` 后增量向量同步
- [x] 设置页 Embedding 偏好 + Hub 索引状态展示

### 未实现 / 待完善

- [ ] PDF 深度摄入管线（非 Markdown 抽取增强）
- [ ] 向量批量 embedding 与进度 UI
- [ ] 按 source_kind / 时间过滤检索

## 4. 架构与数据

| 路径 | 用途 |
|------|------|
| `${WORKSPACE}/.agent/.knowledge/` | 用户知识文档 |
| `knowledge-manifest.json` | 清单元数据 |
| `${WORKSPACE}/.agent/.hermes/index/hermes-memory.db` | FTS + `memory_vec` 向量表 |
| Bootstrap | `workspace-knowledge-bootstrap.ts` |
| 摄入 | `workspace-knowledge-ingest.ts` |
| 向量层 | `engine/hermes/hermes-memory-embeddings.ts` |
| Embedding 偏好 | `main/prefs/hermes-embedding-prefs.ts`（userData） |

## 5. 入口与代码证据

| 类型 | 路径 / 符号 |
|------|-------------|
| Hub UI | `components/workspace-hub/KnowledgeBaseHubPanel.tsx` |
| Manifest | `main/workspace/workspace-knowledge-manifest.ts` |
| IPC | `memoryFts:search`（含 `hybridUsed`）、`memoryFts:rebuild`、`memoryFts:getIndexStatus` |
| 检索 | `engine/hermes/hermes-memory-db.ts` → `searchHermesMemory` |
| 工具 | `hermes_search`（`register-hermes-memory-tools.ts`） |

## 6. 关联文档

- [hermes-memory.md](./hermes-memory.md) — FTS + 向量基础设施
- [product/ux-prototype.md](../product/ux-prototype.md) — Hub kb 分支
- [product/prd.md](../product/prd.md) — Phase 2 规划
