# ClawFlow 产品策划书（PRD v0.2 / AI 可读）

## 元信息

- **文档角色**：定义“做什么/为什么做/做到什么算成”，为设计与研发提供单一事实来源
- **仓库根目录占位**：`${REPO_ROOT}`
- **关联文档**
  - 入口索引：`AICodeFile/00_INDEX.md`
  - 项目总览：`AICodeFile/01_PROJECT_OVERVIEW.md`
  - 路线图：`AICodeFile/04_ROADMAP.md`
  - 架构说明：`AICodeFile/02_ARCHITECTURE.md`
  - 任务清单：`AICodeFile/06_TASKS.md`

## TL;DR

- ClawFlow 是一个 **Electron 桌面端工作助手**，通过 **OpenClaw CLI/Gateway** 提供对话、技能与连接器能力，并用 **安全的 Preload API + IPC** 暴露给 React UI。
- 第一阶段只追求 **核心闭环可用**：对话（含流式）+ 技能管理 + 连接器管理 + Gateway 管理 + 基础设置（主题/语言/引擎配置）。

---

## 1. 背景与机会

### 1.1 背景

- 许多“对话式工作助手”在桌面端的落地，常见问题是：
  - 工具/数据源接入成本高（API、数据库、第三方服务连接繁琐）
  - 能力不可复用（每个用户一套配置、难以迁移/分享）
  - 安全边界不清晰（把系统权限直接暴露给前端/脚本）

### 1.2 机会

- OpenClaw 提供技能、连接器、Gateway 等基础能力；ClawFlow 提供一个“可视化/可管理”的桌面体验，把能力组织成可用产品。
- 参考 WorkBuddy 的模块形态，但 **不要求 UI 复刻**，强调可维护、可扩展、可配置与安全默认。

---

## 2. 目标用户与使用场景

### 2.1 目标用户

- **个人用户（主）**：开发者、运营、产品、研究人员等知识工作者，希望把本地/网络工具接入到对话工作流。
- **团队用户（次）**：希望复用“技能+连接器配置”，减少重复配置成本。

### 2.2 核心场景（Top 5）

- **S1 对话执行**：在 Chat 中提问/指令 → 看到流式回复 → 可复制/回溯历史。
- **S2 技能管理**：浏览技能 → 安装/卸载 → 启用/禁用 → 在对话中可用。
- **S3 连接器管理**：添加连接器配置 → 测试连接 → 在技能中使用。
- **S4 Gateway 管理**：查看运行状态 → 一键启动/停止 → 状态可刷新且一致。
- **S5 设置**：切换主题与语言；配置 OpenClaw 路径/超时/日志级别。

---

## 3. 问题定义（Problem Statement）

用户需要一个桌面端工具，能够：

- 以对话为入口驱动工作流
- 可视化管理与复用技能/连接器
- 对 Gateway 与引擎依赖有明确状态反馈与可恢复路径
- 在 Electron 安全边界内运行，默认不泄露敏感配置

---

## 4. 产品目标与成功标准

### 4.1 产品目标（阶段）

- **M1（P0）核心闭环**：对话 + 技能 + 连接器 + Gateway 管理可用
- **M2（P1）可配置与可维护**：设置页完善、错误/加载/空状态一致、稳定性提升
- **M3（P2）质量保障**：测试与 CI、打包发布质量可控

### 4.2 成功标准（可量化示例）

- **首次使用成功率**：新用户在 5 分钟内完成：
  - 打开应用 → 看到 Gateway 状态 → 完成一次对话发送并得到回复（即使是 mock/降级也有明确提示）
- **可恢复性**：引擎不可用/连接失败时，用户能在 UI 上看到“原因 + 下一步操作”而不是无响应
- **可移植性**：配置/路径不硬编码（`${REPO_ROOT}`、可配置 OpenClaw path）

---

## 5. 范围定义（Scope）

### 5.1 P0（必须）

- **Chat**
  - 会话列表：新建/切换/删除
  - 消息列表：Markdown + 代码高亮 + 复制
  - 流式响应展示（打字机/增量更新）
  - 基础持久化策略明确（如 local storage 或后续替换）
- **Skills**
  - 技能列表：搜索、筛选（已安装/未安装）
  - 安装/卸载、启用/禁用
  - 操作反馈（loading/success/fail）
- **Connectors**
  - 列表：搜索、查看详情
  - 添加/编辑/删除
  - 测试连接
  - 敏感字段脱敏展示（如 token/key/password）
- **Dashboard**
  - OpenClaw 版本
  - Gateway 状态与启停
  - 快捷入口到 Chat/Skills/Connectors/Settings

### 5.2 P1（重要）

- **Settings**
  - 主题（light/dark）
  - 语言（zh/en）
  - OpenClaw 可执行路径（或检测提示）
  - 命令超时、日志级别等
- **稳定性与一致性**
  - Gateway 启停后强制刷新状态，以 `openclaw gateway status` 为事实来源
  - 统一错误/空状态/加载态组件与文案

### 5.3 P2（建议）

- 测试：关键模块单测/集成测试
- CI：lint + typecheck + build
- 发布：make 产物验证、可选签名与自动更新

---

## 6. 用户故事（User Stories）与验收（AC）

> 写法：作为【某类用户】，我想要【能力】，以便【收益】。每条至少 2-4 条验收标准。

### US-1 对话：发送与回复

- **故事**：作为用户，我想发送消息并看到流式回复，以便高效对话。
- **验收**
  - [ ] 输入框支持 Enter 发送、Shift+Enter 换行
  - [ ] 发送后消息立即出现在列表中
  - [ ] 回复以流式方式更新展示（可中途结束或至少能正常落盘）
  - [ ] 失败时显示错误提示与重试入口（如按钮/再次发送）

### US-2 会话：管理历史

- **故事**：作为用户，我想管理会话，以便组织不同主题。
- **验收**
  - [ ] 可新建会话、切换会话、删除会话
  - [ ] 切换会话后消息列表更新正确
  - [ ] 重启应用后会话仍可恢复（或给出明确“未启用持久化”的提示）

### US-3 技能：安装与启用

- **故事**：作为用户，我想安装/启用技能，以便扩展能力。
- **验收**
  - [ ] 能看到技能列表与基本信息
  - [ ] 安装/卸载操作有 loading 与结果提示
  - [ ] 未安装时“启用开关”不可用且有解释

### US-4 连接器：配置与测试

- **故事**：作为用户，我想配置连接器并测试连接，以便技能可用。
- **验收**
  - [ ] 可新增/编辑/删除连接器
  - [ ] 测试连接返回成功/失败并给出原因
  - [ ] 敏感字段默认脱敏展示

### US-5 Gateway：状态与启停

- **故事**：作为用户，我想看到 Gateway 状态并启停，以便系统可用。
- **验收**
  - [ ] 状态显示：running/stopped/unknown
  - [ ] 启停按钮有 loading，结束后自动刷新状态
  - [ ] OpenClaw 不可用时显示“缺少依赖/找不到命令”的指引

### US-6 设置：主题与语言

- **故事**：作为用户，我想切换主题和语言，以便符合习惯。
- **验收**
  - [ ] 主题切换立即生效且可持久化
  - [ ] 语言切换立即生效且可持久化
  - [ ] 关键页面文案覆盖完整

---

## 7. 信息架构（IA）与导航

- **左侧导航**（建议固定）
  - Dashboard
  - Chat
  - Skills
  - Connectors
  - Settings

### 7.1 可视化原型（Single Source of Truth）

- **HTML 原型入口**：`${REPO_ROOT}/AICodeFile/prototype/index.html`
- **覆盖范围**：主页面（Dashboard/Chat/Skills/Connectors/Settings）+ 关键弹窗/抽屉 + 空/加载/错误态 + Toast
- **使用原则**：在 UI 重构与实现阶段，页面结构/组件样式/状态文案以 `AICodeFile/prototype/` 为准；PRD 负责定义“做什么/为什么做/做到什么算成”，原型负责定义“长什么样/怎么交互”。

### 7.2 视觉与组件规范（极简深色主题）

- **主题色**：灰 + 暗绿 + 暗金（低干扰、强调关键动作与状态）
- **颜色 Token（建议）**
  - 背景：`#0F1113`（应用底色）、`#1A1D21`（侧栏/分区）、`#2A2F36`（卡片/浮层）
  - 文本：主文 `#E6E9ED`，次文 `#A7B0B8`，弱化 `#6E7681`
  - 主色（暗绿）：`#1E5B45`（主按钮/高亮），hover `#237055`
  - 强调（暗金）：`#8A6A2A`（状态/提示），hover `#9B7A33`
  - 危险：`#C24B4B`（仅用于错误与删除确认）
- **形态**
  - 圆角：8–10px；分割线：1px `#2F353D`
  - 卡片化分区：信息块统一卡片容器，避免“满屏表格”
- **核心组件（P0/P1）**
  - Button（Primary/Secondary/Ghost/Danger）
  - Card / Banner
  - Status Chip：Running / Stopped / Unknown
  - Field：Input/Select/Textarea + 校验错误文案
  - Drawer（连接器新增/编辑）
  - Modal（删除确认）
  - Toast（success/error）
  - Empty / Loading Skeleton / Error（分层 + 下一步）

---

## 8. 关键流程（Flow）

### 8.1 Renderer → Preload → Main → OpenClaw（通用调用链）

- Renderer 调用 `window.electronAPI.*`
- Preload 用 `ipcRenderer.invoke(channel, payload)`
- Main 用 `ipcMain.handle(channel, handler)` 并在 handler 内调用 OpenClaw CLI/Gateway
- 返回 `{ ok, data, error }`（建议统一返回结构，避免前端散落 try/catch）

### 8.2 错误提示策略（原则）

- **错误要分层**：依赖缺失、网络/连接、参数校验、权限/安全、未知异常
- **用户可行动**：每个错误提示至少包含一个“下一步”

---

## 9. 数据与配置（概念层）

- **会话数据**
  - `Conversation { id, title, createdAt, updatedAt }`
  - `Message { id, role, content, createdAt, meta? }`
- **技能数据**
  - `Skill { name, version, description, installed, enabled }`
- **连接器数据**
  - `Connector { id, name, type, config, status? }`
- **设置**
  - `theme, language, openclawPath, timeoutMs, logLevel, autoStartGateway...`

---

## 10. 非功能性需求（NFR）

- **安全**
  - Renderer 不直接拥有 Node 能力
  - 仅通过 preload 暴露最小 API
  - 敏感配置默认脱敏展示
- **可用性**
  - 关键操作必须有 loading/错误/空状态
  - 避免“点击无反应”
- **一致性**
  - Gateway 状态以 CLI 查询为事实来源
- **可维护性**
  - 文档与代码的路径约定用 `${REPO_ROOT}`

---

## 11. 埋点与指标（可选，后续补）

- 首次运行成功率、对话发送成功率、技能安装成功率、连接器测试成功率
- 关键错误类型分布（缺少 openclaw / 超时 / 配置错误 / 未知）

---

## 12. 风险与应对

- **R1 OpenClaw 不可用**
  - 应对：启动时检测并给出安装/路径配置入口；关键页面降级提示
- **R2 状态不一致（启停与 UI 不同步）**
  - 应对：启停后强制刷新；以 status 命令为准；避免只靠内存句柄
- **R3 配置泄露**
  - 应对：脱敏展示；导出/日志避免输出敏感字段

---

## 13. 里程碑与交付物

- 里程碑见：`AICodeFile/04_ROADMAP.md`
- 任务拆分见：`AICodeFile/06_TASKS.md`

---

## 14. 验收清单（发布前最小集合）

- [ ] Chat：发送、流式回复、会话管理、错误提示可恢复
- [ ] Skills：安装/卸载/启用/禁用可用且有反馈
- [ ] Connectors：增删改、测试连接、敏感字段脱敏
- [ ] Dashboard：版本与 Gateway 状态/启停可用
- [ ] Settings：主题/语言可切换并持久化
- [ ] 关键依赖缺失时提示清晰（openclaw 找不到/不可执行）
- [ ] Gateway 启停后状态刷新一致（以 status 命令为准）
