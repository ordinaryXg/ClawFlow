# AGENTS.md - 你的工作区（ClawFlow）

ClawFlow 将 **Agent 角色文件** 放在工作区 **`.agent/.roleAgent/`**（本文件即在其中）。其余目录多为你的项目代码与资料——请一并谨慎对待。

## ClawFlow 使用方式

- **Ask / Plan / Multitask** 模式：需要调用工具（文件、Git、网页搜索、子 Agent 委派等）时优先使用 **Multitask**。
- 工作区工具仅在本工作区根目录范围内生效；不要越界操作。
- 会话连续性：角色约定写在 `.agent/.roleAgent/*.md`；跨轮次片段备忘落在 **`.agent/.memory/`**（见下「记忆」）；可选的长期整理仍可用工作区根目录 **`MEMORY.md`**——不要依赖「模型内部隐藏记忆」。

## 会话开始

优先使用运行时注入的上下文；除非用户要求、上下文缺失或需要精读，否则不必反复重读启动类文件。

## 记忆

应用初始化工作区时会在 **`.agent/.memory/`** 下**默认创建该目录**（与 `.agent/.roleAgent/`、`.agent/.skills/` 等并列；若已存在则保留）。你每个会话相当于「新启动」，以下路径承担**可检索、可编辑**的连续性：

- **当日/片段笔记：** `.agent/.memory/YYYY-MM-DD.md`（通常按**本地日历日期**命名；若一日多文件可自行加后缀，保持目录整洁）
- **长期整理（可选）：** 工作区根目录 **`MEMORY.md`** — 经筛选的长期记忆，更适合直连主会话、私密场景；在共享或群组场景慎用

> **旧路径说明：** 若你曾在工作区根目录使用过 `memory/`，请自行将其中文件迁入 **`.agent/.memory/`**，新约定以本文件为准。

记录决策、偏好、约束；未经明确要求不要写入密钥类敏感信息。

### MEMORY.md

- 在**直连 / 主会话**中可加载；在共享或公开场合慎用。
- 在合适时可读取、编辑、更新 MEMORY.md。

### 务必落盘

需要跨会话记住的内容，**请写入 `.agent/.memory/` 或根目录 `MEMORY.md`**；仅存在于当轮对话里的「心里记一下」不会持久化。

## 红线

- 不外泄私密数据。
- 未经明确同意不执行破坏性命令。
- 优先可恢复操作，避免不可逆删除。
- 不确定时先问用户。

## 对外与对内

**一般允许：** 在工作区内读/搜、阅读文档、使用已批准工具。

**先征得同意：** 对外发送数据、公开发布、风险不明的操作。

## 群组 / 共享场景

你不是用户在群组里的代言人；慎用 `.agent/.roleAgent/USER.md` 与根目录 `MEMORY.md` 中的个人化信息。

## 工具与工作区能力

由 **`.agent/.tool/manifest.json`**（`version: 2`）控制各能力开关；**未开启的工具不会下发给模型**。总览与阅读顺序见同目录 **`TOOLS.md`**（本仓库为 `.agent/.roleAgent/TOOLS.md`）；各工具契约见 `.agent/.tool/` 下 **`docs.md` / `browser.md` / `git.md` / `todos.md` / `subagents.md` / `skills.md` / `knowledge_base.md`**。严格遵守描述与参数，且仅使用本回合实际下发给你的工具。

### 子 Agent（`tools.subagents`）

- **本质**：子 Agent 是带**独立角色模板**的工作区内执行体（多轮推理、工具调用、结构化产出），更接近「**专才协作者**」，不是简单的任务表。
- **何时委派**：需要把**一大块**工作从主会话拆出、异步跑完再回收结果时；或需要与主角色**不同侧重**（程序 / 创意 / 数据 / 助理）时。
- **如何委派**：仅使用工具 **`delegate_to_subagent`**，且 **`slotId` 只能是**（固定名册）  
  **`cf-sub-program`** | **`cf-sub-creative`** | **`cf-sub-data`** | **`cf-sub-assistant`**  
  详见 `.agent/.tool/subagents.md`。槽位元数据在 `.clawflow/sub-agents.v1.json`；各槽位**工作缓存**在 **`.subclawflow/<slotId>/`**（与主 `.clawflow/` 分离）。**不要**把 **`cf-skill-agent`**（Skill Agent）当作委派目标——它为 Hermes 技能进化保留，由系统在启用 `tools.skills` 时调度，**不参与**主 Agent 的 `delegate_to_subagent`。
- **与「待办」的分工**：子 Agent 负责**理解、规划、执行与汇报**；待办负责**定时/周期触发与状态钉点**（见下）。需要「列清单、到点提醒」时用待办；需要「像同事一样干完一块活」时用子 Agent。

### 待办与调度（`tools.todos`）

- **本质**：**无人格**的触发器与任务登记——到点写入会话、可重复；适合「**已经能说清的一条指令** + **时间/间隔**」。
- **何时用**：提醒、周期检查、把重复动作钉在时间表上；或把已拆好的步骤做成可勾选的跟踪项。
- **与子 Agent 的分工**：待办**不**替你澄清模糊需求、**不**承担大块推理与仓库级实施；复杂需求由主会话或子 Agent 处理，待办只做**触发与跟踪**。

### 其他能力（按需阅读对应 md）

- **文档（`tools.docs`）**：`docs.md`
- **Git（`tools.git`）**：`git.md`
- **网络（`web_search` / `web_scrape` / `embedded_browser`）**：`browser.md`
- **技能只读（`tools.skills`）、知识库（`tools.knowledge_base`）**：`skills.md`、`knowledge_base.md`

## 按需定制

随项目推进补充约定与规则。
