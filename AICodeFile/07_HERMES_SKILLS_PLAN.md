# Hermes 式自主进化型 Skills — ClawFlow 落地方案

> **参考原理**：同级目录 `../docs/hermes-self-evolution-principles.md`（Hermes Agent 自进化技术详解，2026-05-11 整理稿）。  
> **本文定位**：与当前 ClawFlow 代码结构对齐的可执行产品/技术方案；**开发步骤表见 §8**，**首期优先 SQLite + FTS5 记忆检索**。

---

## 1. 目标与边界

### 1.1 要对齐的「自进化」本质

闭环：**执行 → 轨迹 → 模式提取 → Skill 持久化 → 下次按需复用**，由 **System 行为约束 + 专用工具 API + 安全门控 + 渐进式加载** 协同完成（参见原理文档 §1、§11）。

### 1.2 ClawFlow 工程边界

- 运行时主体：**Electron Main** 的 `ToolRuntime` + `ClawFlowEngine`；对话走内置 **GatewayDaemon**，非 Python Agent 主循环。
- **工作区为信任与持久化边界**：技能与索引默认落在 `${WORKSPACE}/.clawflow/`，与 `todo-triggers`、`sub-agents`、`scrapes` 一致。
- **工具可见性**继续由 `.tool/manifest.json` 治理：新增能力须同步 `src/shared/workspace-tools.ts` 与 `src/shared/workspace-tool-manifest-bridge.ts`。

### 1.3 显式非目标（首期不纳入 Electron 热路径）

- DSPy + GEPA **离线**进化、tinker-atropos RL 导出（原理文档 §5–6）——可作为 **外环脚本/独立仓库**，不阻塞 MVP。
- Skill 内 **scripts/** 的任意执行（默认禁止，需单独白名单设计）。

---

## 2. Hermes 机制 → ClawFlow 映射

| 原理文档中的机制 | ClawFlow 落点 |
|------------------|---------------|
| `skill_manage`（create / **patch** / edit / delete / write_file） | `src/engine/tool-runtime.ts` 注册 `workspace_skill_*` 系列工具 |
| 目录：`SKILL.md` + `references/` 等 | `${WORKSPACE}/.clawflow/skills/<category?>/<name>/` |
| Progressive Disclosure：`skills_list` / `skill_view` | `workspace_skill_list` / `workspace_skill_view`；**不把全文默认注入** `buildHistoryMessages` |
| Frozen Snapshot（会话内 system 前缀稳定） | 每轮对话开始前固定注入 **技能索引快照**（仅 name/description/version）；磁盘变更标注 `effectiveNextTurn` |
| Periodic Nudge | 在 `clawflow-engine` 多轮 loop 或独立计数器注入**短提醒**；**不改写**已缓存的大块 role system（实现细节需按 provider 实测） |
| `skills_guard` | Main 进程校验模块（如 `src/engine/skills-guard.ts`），写入后失败则整包回滚 |
| SQLite + FTS5 会话/记忆检索 | **优先实现**：`${WORKSPACE}/.clawflow/hermes-memory.db`（见 §5、§8） |

---

## 3. 分阶段产品路线（逻辑依赖）

| 阶段 | 内容 | 依赖 |
|------|------|------|
| **P0** | 工作区内 **SQLite + FTS5** 索引与检索 API（记忆片段 + Skill 正文/附件） | 无 |
| **P1** | `workspace_skill_*` 工具（list/view/create/patch/delete + 辅助文件） + `skills_guard` + 原子写 | P0 可选并行，但检索应在 skill 数量增长前可用 |
| **P2** | Role/System 行为指令 + Periodic Nudge + 审计日志 `skills-audit.jsonl` | P1 |
| **P3** | UI：Skills 页/Hub 列表、危险操作开关、与 tool approval 对齐 | P1 |
| **P4** | 离线进化外环（GEPA 等）+ 人工审阅后导入 | P1+ |

---

## 4. 工具与 manifest 约定（P1 起）

建议在 `workspace-tool-manifest-bridge.ts` 增加（示例）：

- `skills`: `workspace_skill_list`, `workspace_skill_view`, `workspace_skill_create`, `workspace_skill_patch`, `workspace_skill_delete`, `workspace_skill_write_aux`, `workspace_skill_remove_aux`
- **记忆检索**（可与 `knowledge_base` 分列或暂挂 `skills` 下，立项时二选一）：
  - `workspace_memory_search` — FTS5 检索，返回路径+片段+rowid
  - `workspace_memory_upsert` — 将指定来源（对话摘要、SKILL 段落等）写入索引表（若与 skill 工具分离更清晰）

**原则**：patch **优先于**全量 edit；所有写操作经 `skills_guard` + 路径校验。

---

## 5. SQLite + FTS5 设计（P0 优先）

### 5.1 文件位置

- 路径：`${WORKSPACE}/.clawflow/hermes-memory.db`（单工作区一份，便于备份与删除工作区时一并清理）。

### 5.2 建议表结构（初稿）

```sql
-- 逻辑文档单元：一条「可被检索」的文本块
CREATE TABLE IF NOT EXISTS memory_docs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_kind TEXT NOT NULL,   -- 'skill_md' | 'skill_aux' | 'session_turn' | 'user_note' | ...
  source_path TEXT,            -- 工作区内相对路径或逻辑 key
  skill_name TEXT,             -- 可选，便于过滤
  title TEXT,
  mtime_ms INTEGER NOT NULL,
  body TEXT NOT NULL           -- 参与 FTS 的正文
);

CREATE VIRTUAL TABLE IF NOT EXISTS memory_fts USING fts5(
  body,
  content='memory_docs',
  content_rowid='id',
  tokenize='unicode61'
);

-- 保持 FTS 与 memory_docs 同步的触发器（insert/update/delete）
-- （具体 SQL 在实现时写入 migration 模块）
```

### 5.3 索引更新策略

- **写入路径 A**：Skill 工具成功写入 `SKILL.md` 或 `references/*` 后，**同步 upsert** 对应 `memory_docs` 行并刷新 FTS。
- **写入路径 B**（可选）：对话回合结束时，将**脱敏后的摘要**写入 `session_turn`（需配额与用户设置，默认关闭或仅开发模式）。
- **重建索引**：提供 IPC/CLI `rebuild_skill_fts`：遍历 `.clawflow/skills/**` 全量重扫，修复漂移。

### 5.4 技术选型（Electron Main）

- 优先 **`better-sqlite3`**（同步 API，适合主进程短事务）或团队已接受的 `sql.js`；需在 **Forge 打包**中配置 **native 模块重建**（与现有 `pdf` 等 native 依赖策略一致）。
- **禁止**在 Renderer 直接访问 DB；统一 **IPC**（如 `memoryFTS:search` / `memoryFTS:rebuild`）或由 `tool-runtime` 仅通过 Main 内模块调用。

### 5.5 与现有 `workspace_knowledge_query` 的关系

- 中期目标：`workspace_knowledge_query` **内部走 FTS5** 返回可引用片段（路径 + 偏移/摘要），替换当前 stub。
- 短期：可先实现 **独立** `workspace_memory_search` 工具，避免与 KB manifest 命名纠缠，待稳定后合并对外契约。

---

## 6. 安全与合规（全程）

- 路径遍历防护、`skillRoot` 内写权限、**原子写**（temp + rename）。
- `skills_guard`：注入/外泄启发式扫描；失败 **回滚**。
- 对话摘要入索引：**PII 脱敏**与用户可选开关。
- 离线进化产出：**仅人工审阅后**导入（原理文档 §5.3、§8.2）。

---

## 7. 未决项（立项拍板）

1. **技能是否跨工作区共享**：默认否；若全局库需 `app.getPath('userData')` 下独立 DB 与同步策略。
2. **Nudge 注入形态**：以不破坏 provider 消息约束为准，备选「仅 user 附加条」。
3. **manifest 键**：记忆检索挂在 `tools.skills` 还是 `tools.knowledge_base` —— 推荐 **knowledge_base** 管「检索」，**skills** 管「CRUD」。

---

## 8. 开发步骤表（执行顺序）

> **说明**：步骤编号 **从小到大为建议实现顺序**；「优先」行对应你要求的 **先做 SQLite + FTS5**。

| 步骤 | 交付物 | 验收要点 | 依赖 |
|------|--------|----------|------|
| **S1** | 选型并接入 Main 进程 SQLite 驱动（`better-sqlite3` 等）+ Forge 打包配置 | 开发/打包环境可打开 `${WORKSPACE}/.clawflow/hermes-memory.db` 无崩溃 | — |
| **S2** | 新建 `src/engine/hermes-memory-db.ts`（或同级模块）：建表、`memory_docs` + `memory_fts5` + 同步触发器 | 单元测试或最小脚本：insert 后 `MATCH` 能命中 | S1 |
| **S3** | 从 `.clawflow/skills/**` 扫描：`SKILL.md` 与 `references/**` 文本进入 `memory_docs`；`mtime` 变更则更新 | 新建/修改 skill 文件后检索可见；重建接口可全量修复 | S2 |
| **S4** | 暴露 IPC：`memoryFtsSearch`（query、limit、可选 skill_name 过滤） | Renderer 或工具层可调；返回结构化片段 | S3 |
| **S5** | `tool-runtime` 注册 **`workspace_memory_search`**（及如需 **`workspace_memory_rebuild_index`**）并接入 manifest | 关断 manifest 时工具拒绝；Plan 模式下可调用 | S4 |
| **S6** | `workspace_skill_list` / `workspace_skill_view`（只读） | 渐进披露：列表小、view 按需 | S3 可并行，建议 S5 前完成只读 |
| **S7** | `workspace_skill_create` / `workspace_skill_patch` / `workspace_skill_delete` + `skills_guard` + 原子写 | 非法内容与路径被拒绝；失败无脏文件 | S6 |
| **S8** | Skill 写操作成功后 **回调索引更新**（走 S3 逻辑） | patch skill 后立即检索到新正文 | S7 + S3 |
| **S9** | `buildRoleAgentSystemContent` + `.roleAgent`：Skill 行为与 Nudge 说明 | 长任务后模型可触发创建；频率可配置 | S7 |
| **S10** | `clawflow-engine`：技能索引快照 + Nudge 计数注入 | 单会话内行为不随意漂移 | S9 |
| **S11** | UI：Skills Hub/页展示列表、打开目录、高危开关 | 与现有 i18n、Hub 一致 | S7 |
| **S12**（外环） | 导出轨迹 + 离线进化脚本 + 人工导入 | 不自动合并 | S7 |

**优先级重申**：**S1 → S5** 为 **SQLite + FTS5 记忆检索** 最短闭环；**S6–S8** 为 Skill 生命周期与索引联动；**S9–S11** 为体验与行为层增强。

---

## 9. 文档维护

- 原理变更：以 `../docs/hermes-self-evolution-principles.md` 为准，本文仅调整 **ClawFlow 映射与步骤**。
- 代码变更后：更新 `03_PRD.md` §3.5、`04_ROADMAP.md` M2、`06_TASKS.md` 中与本文件对应的任务勾选。

---

*版本：2026-05-11 · 与仓库 `AICodeFile/` 其他文档同级维护*
