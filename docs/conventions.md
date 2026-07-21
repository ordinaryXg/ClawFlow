# ClawFlow 文档规范

本文定义 `docs/` 目录的统一命名、结构与维护约定。所有文档以**当前代码为单一事实来源**。

---

## 1. 目录结构

```
docs/
├── README.md                 # 文档总索引（入口）
├── conventions.md            # 本规范
├── product/                  # 产品层：需求、原型、用户旅程
├── engineering/              # 工程层：架构、性能、构建
├── features/                 # 功能层：每个独立功能一份文档
└── reviews/                  # 评估快照（按日期归档，非日常维护）
```

根目录 `README.md` 面向协作者与 AI 的**代码入口**；`docs/` 面向**产品 + 功能 + 架构**的完整说明。

---

## 2. 文件命名

| 规则 | 示例 |
|------|------|
| 使用 **kebab-case**（小写 + 连字符） | `chat-engine.md`、`hermes-memory.md` |
| 索引文件统一为 `README.md` | `docs/features/README.md` |
| 评估快照带日期后缀 | `feature-completeness-2026-06-02.md` |
| 禁止中文文件名 | ~~`功能说明.md`~~ → `features/workspace.md` |
| 禁止空格与特殊字符 | ~~`PRD v2.md`~~ → `product/prd.md` |

---

## 3. 功能文档模板

每个独立功能对应 `docs/features/<feature-id>.md`，必须包含以下章节（顺序固定）：

```markdown
# <功能中文名>

| 字段 | 值 |
|------|-----|
| **功能 ID** | `<feature-id>` |
| **状态** | 已落地 / 部分落地 / 未实现 / 已移除 |
| **完成度** | N% |
| **优先级** | P0 / P1 / P2 |
| **最后更新** | YYYY-MM-DD |

## 1. 功能概述
（1–3 段：做什么、解决什么问题）

## 2. 用户场景
（典型使用流程，可含 mermaid）

## 3. 实现进度
### 已落地
- [x] 项（附证据路径）
### 部分落地
- [ ] 项（说明缺口）
### 未实现 / 待完善
- [ ] 项

## 4. 架构与数据
（目录约定、IPC、存储路径）

## 5. 入口与代码证据
| 类型 | 路径 / 符号 |
|------|-------------|

## 6. 关联文档
（链接到其他 feature / engineering / product 文档）
```

### 状态定义

| 状态 | 判定标准 |
|------|----------|
| **已落地** | 有代码路径 + 可触发入口（UI / IPC / Tool）+ 类型或数据模型 |
| **部分落地** | 核心链路可用，但 PRD 或验收项有明确缺口 |
| **未实现** | 仅有占位、类型或文档设想，无运行路径 |
| **已移除** | 代码已删除或主动清理，文档保留历史说明 |

### 完成度更新

- 功能变更时同步更新对应 `features/*.md` 的「实现进度」与「完成度」。
- `features/README.md` 总表与各功能文档保持一致。
- 大型评估可归档到 `reviews/`，但不替代功能文档的日常维护。

---

## 4. 路径占位符

| 占位符 | 含义 |
|--------|------|
| `${REPO_ROOT}` | 仓库根目录 |
| `${WORKSPACE}` | 用户选定的工作区根目录 |
| `${AppCache}` | 应用缓存根（设置 → system） |

---

## 5. 交叉引用

- 功能文档之间用相对路径：`../engineering/architecture.md`、`./chat-engine.md`
- 引用代码时使用反引号路径：`src/engine/core/clawflow-engine.ts`
- `src/engine/` 按域分子目录（`core/`、`session/`、`hermes/`、`tool-runtime/` 等），勿在 `engine/` 根下新增平铺 `.ts` 文件
- 聊天主路径统一描述为：**Gateway WebSocket**（`chat-gateway-client.ts`）；`engine:sendMessage` 为回退路径
- 工作区切换统一描述为：**`applyActiveWorkspace`** / `workspace:setActive`

---

## 6. 维护触发条件

| 变更类型 | 需更新的文档 |
|----------|--------------|
| 新增 IPC / 工具名 | 对应 `features/*.md` + `engineering/architecture.md` §IPC |
| 新增 UI 路由 / Hub 分支 | `product/ux-prototype.md` + 相关 feature + `locales/*` |
| `${WORKSPACE}` 目录结构变更 | `features/workspace.md` + `engineering/architecture.md` §数据落盘 |
| 性能目标或基线变更 | `engineering/performance.md` |
| PRD 范围变更 | `product/prd.md` |

---

## 7. 语言与受众

- 文档正文使用**中文**（代码符号、路径、IPC channel 保持英文）。
- 面向开发者与 AI 协作者：强调**可验证证据**（文件路径、函数名、IPC channel），避免空泛描述。
