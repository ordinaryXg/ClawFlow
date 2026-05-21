# 知识库检索（knowledge_base）

## 是什么

工作区 **Hermes 全文索引**（`.agent/.hermes/index/hermes-memory.db`），统一检索三类内容：

- **记忆**：仅存索引，逻辑路径 `.agent/.hermes/memory/*.md` → 用 `hermes_memory_*` 读写
- **知识库**：磁盘 `.agent/.knowledge/**`（`.md` / `.txt`）→ 用 `tools.docs` 写文件，自动进索引
- **工作区技能**：磁盘 `.agent/.skills/**` → 读写见 `skills.md`；检索命中后再 view 原文

> 开关：`.agent/.tool/manifest.json` → `tools.knowledge_base`

## 边界

**能做**：`hermes_search` 检索；记忆 upsert / delete / list；`workspace_memory_rebuild_index` 全量重建。

**勿**：用 `workspace_write_file` 写 `.agent/.hermes/memory/`（须 `hermes_memory_upsert`）；把搜索 snippet 当全文；调用已废弃的 `workspace_knowledge_query` / `workspace_memory_search`（一律用 `hermes_search`）。

## 工具与参数

| 工具 | 要点 |
|------|------|
| `hermes_search` | **`query`**；可选 `limit`（1–50）、`skill_name`；返回 JSON hits |
| `hermes_memory_upsert` | `relative_path`、`body`；可选 `title`、`abstract`（L0 摘要）、`overview`（L1 概览） |
| `hermes_memory_delete` | `relative_path` |
| `hermes_memory_list` | 无参；列出记忆条目 |
| `workspace_memory_rebuild_index` | 无参；bulk 改盘或检索明显滞后时用 |

## 该怎么用

1. **检索**：优先 `hermes_search`。
2. **读原文**：知识库 → `workspace_read_file`；技能 → `workspace_skill_view`；记忆 → hit 或 `hermes_memory_list`。
3. **写记忆**：`hermes_memory_upsert`；跨会话备忘、偏好、结论放这里。
4. **写知识库**：`tools.docs` 写到 `.agent/.knowledge/`；一般不必手动 rebuild。

## 工具清单（受 `tools.knowledge_base` 关断）

{{TOOLS:knowledge_base}}
