# TOOLS.md — 能力地图（`.agent/.tool/` 导引）

本文件在 **`.agent/.roleAgent/TOOLS.md`**，作用是把「工作区里与工具有关的东西」串成一张**地图**：先看清 `.agent/.tool/` 里有什么、各管什么，再往下看「本机/项目独有」的备忘。

> `.agent/.tool/README.md` 若存在，仅作为**入口跳转**；总览与入口说明以 **本文件（TOOLS.md）** 为准。

---

## 与 `.agent/.tool/` 的对应关系

工作区 **`.agent/.tool/`** 由应用初始化，主要包含：

| 文件 | 作用 |
|------|------|
| **`manifest.json`** | 能力开关（`version: 2`）：`tools.docs`、`tools.git`、`tools.shell`、`tools.web_search`、`tools.web_scrape`、`tools.embedded_browser`、`tools.todos`、`tools.skills`、`tools.knowledge_base` 等。引擎按此过滤模型工具；创建/设置工作区时的勾选会写回此文件。 |
| **`docs.md`** | 文档类工具清单（与 `tools.docs` 对应）。 |
| **`browser.md`** | 网络搜索 / 爬取 / 内嵌打开（与 `web_search`、`web_scrape`、`embedded_browser` 对应）。 |
| **`git.md`** | Git 类工具说明（与 `tools.git` 对应）。 |
| **`shell.md`** | 工作区内命令行执行（与 `tools.shell` 对应）。 |
| **`todos.md`** | 待办与**定时/周期调度**（与 `tools.todos` 对应）：无人格、结构化触发。 |
| **`skills.md`** | Hermes 工作区技能只读能力（与 `tools.skills` 对应）。 |
| **`knowledge_base.md`** | 知识库检索（与 `tools.knowledge_base` 对应）。 |

阅读顺序建议：**manifest.json**（当前开了什么）→ 按需打开上表 **`.md`** 了解参数与边界。

---

## 工具使用准则：副作用必须可验证

当你调用任何“会改变真实世界状态”的工具（例如写文件/补丁、Git 写操作、重置/删除目录、创建待办、创建/修改技能等），都必须遵守：

- **不允许只报喜不举证**：除非给出可核验的证据，否则不得声称“已写入/已更新/已创建/已删除/已完成”。
- **最小证据（满足其一即可）**
  - 对目标文件/目录做**回读/列出**并贴出关键片段（路径 + 关键内容）。
  - 给出 **diff 证据**（例如 git diff 或明确列出新增/修改段落与落点）。
  - 给出可搜索的**落点信息**：路径 + 标题/小节 + 关键词，并贴出原文对照。
- **失败要直说**：工具没权限、没下发、路径不存在、执行报错，都必须明确说“未完成/未写入”，并说明下一步需要什么输入或授权。

> 例外：纯只读类工具（读取/搜索/浏览）可以只汇报发现，但不得把“计划执行”表述为“已执行”。

## 工作区根下的状态目录（补充）

| 目录 | 作用 |
|------|------|
| **`.agent/.memory/`** | 主 Agent 跨会话笔记（**L0 `abstract` / L1 `overview` frontmatter** + L2 正文）；由 FTS 索引 |
| **`.agent/.clawflow/`** | 主会话、待办调度、爬取与 Hermes DB 等 |

---

## 写在本文件下半部分：本地备忘

下面这是你（或助手）维护的 **本机 / 本项目独有** 信息，不属于 `.agent/.tool/` 里那种通用契约说明：

- SSH 主机与别名、内网 API、设备名
- 语音 / TTS 偏好、代理与环境变量提示
- 任何「只有这台机器或这个项目才需要」的速查

---

按需补充；契约与开关始终以 `.agent/.tool/manifest.json` 与各 `*.md` 为准。
