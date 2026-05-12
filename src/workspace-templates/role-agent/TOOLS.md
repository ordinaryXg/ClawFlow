# TOOLS.md — 能力地图（`.agent/.tool/` 导引）

本文件在 **`.agent/.roleAgent/TOOLS.md`**，作用是把「工作区里与工具有关的东西」串成一张**地图**：先看清 `.agent/.tool/` 里有什么、各管什么，再往下看「本机/项目独有」的备忘。

> `.agent/.tool/README.md` 若存在，仅作为**入口跳转**；总览与入口说明以 **本文件（TOOLS.md）** 为准。

---

## 与 `.agent/.tool/` 的对应关系

工作区 **`.agent/.tool/`** 由应用初始化，主要包含：

| 文件 | 作用 |
|------|------|
| **`manifest.json`** | 能力开关（`version: 2`）：`tools.docs`、`tools.git`、`tools.web_search`、`tools.web_scrape`、`tools.embedded_browser`、`tools.todos`、`tools.subagents`、`tools.skills`、`tools.knowledge_base` 等。引擎按此过滤模型工具；创建/设置工作区时的勾选会写回此文件。 |
| **`docs.md`** | 文档类工具清单（与 `tools.docs` 对应）。 |
| **`browser.md`** | 网络搜索 / 爬取 / 内嵌打开（与 `web_search`、`web_scrape`、`embedded_browser` 对应）。 |
| **`git.md`** | Git 类工具说明（与 `tools.git` 对应）。 |
| **`todos.md`** | 待办与**定时/周期调度**（与 `tools.todos` 对应）：无人格、结构化触发。 |
| **`subagents.md`** | 子 Agent 名册与委派约定（与 `tools.subagents` 对应）：专才执行体 vs 待办的区别见该文。 |
| **`skills.md`** | Hermes 工作区技能只读能力（与 `tools.skills` 对应）。 |
| **`knowledge_base.md`** | 知识库检索（与 `tools.knowledge_base` 对应）。 |

阅读顺序建议：**manifest.json**（当前开了什么）→ 按需打开上表 **`.md`** 了解参数与边界。

---

## 工作区根下的状态目录（补充）

| 目录 | 作用 |
|------|------|
| **`.agent/.clawflow/`** | 主会话、待办调度、子 Agent 名册元数据（如 `sub-agents.v1.json`）、爬取与 Hermes DB 等 |
| **`.subagent/.subclawflow/<槽位 id>/`** | 各子 Agent **工作缓存**（与主 `.agent/.clawflow/` 分离；每固定槽位一子目录） |
| **`.subagent/.submemory/<槽位 id>/`** | 各子 Agent **独立记忆**（与主 `.agent/.memory/` 分离） |
| **`.subagent/.subroleAgent/<模板 id>/`** | 各子 Agent **角色模板**（可覆盖） |

---

## 写在本文件下半部分：本地备忘

下面这是你（或助手）维护的 **本机 / 本项目独有** 信息，不属于 `.agent/.tool/` 里那种通用契约说明：

- SSH 主机与别名、内网 API、设备名
- 语音 / TTS 偏好、代理与环境变量提示
- 任何「只有这台机器或这个项目才需要」的速查

---

按需补充；契约与开关始终以 `.agent/.tool/manifest.json` 与各 `*.md` 为准。
