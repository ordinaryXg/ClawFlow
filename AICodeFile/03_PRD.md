# ClawFlow 产品需求文档（PRD）

> **文档角色**：从「构建脚本 → 主进程启动 → IPC 能力面 → 用户价值」反向梳理后的产品说明，与实现细节解耦、与代码现状对齐。  
> **关联文档**：`01_PROJECT_OVERVIEW.md`（总览）、`02_ARCHITECTURE.md`（分层与文件索引）、`04_ROADMAP.md`（里程碑）、`06_TASKS.md`（任务清单）。

---

## 1. 产品概述

### 1.1 定位

**ClawFlow** 是一款基于 **Electron** 的桌面应用：在本地工作区（Workspace）内提供 **AI 对话**、**技能（Skills）**、**连接器（Connectors）** 与 **全局设置**。底层能力由 **ClawFlow 内置引擎（ClawFlowEngine）** 与 **内置 Gateway 守护进程（GatewayDaemon）** 提供。**本产品不依赖、不要求安装任何 OpenClaw CLI**（无外置 `openclaw` 可执行文件作为交付前提）。

产品形态对标「桌面协作/对话类应用」的体验目标（如 WorkBuddy 类场景），**不强制复刻**任何既有产品的 UI。

### 1.2 技术形态（一句话）

**Main（Node/Electron）+ Preload（安全桥）+ Renderer（React + Ant Design + Zustand）**，Renderer 仅通过 `window.electronAPI` 调用主进程 IPC；敏感与文件系统操作集中在 Main。

### 1.3 核心价值主张

| 能力 | 用户价值 |
|------|----------|
| 多工作区 | 按项目/目录隔离数据与上下文，支持最近列表与切换 |
| 对话与流式输出 | 低延迟阅读体验；会话持久化在工作区内 |
| 模型与鉴权 | 多厂商（DeepSeek / OpenAI / Anthropic）配置与连接测试 |
| 技能与连接器 | 扩展能力与外部系统集成（由主进程内置逻辑与 IPC 提供） |
| 本地 Gateway | 内置 HTTP/WebSocket 服务，支撑实时通道与进阶集成 |

---

## 2. 目标用户与典型场景

### 2.1 目标用户

- 需要在 **本地文件夹** 内与 AI 协作的开发者/知识工作者  
- 希望 **开箱即用**、无需单独安装命令行工具的桌面用户  
- 需要 **中英文界面** 的用户  

### 2.2 典型场景（用户故事）

1. **切换工作区**：用户选择本地目录作为 Workspace，应用初始化 `.clawflow/` 元数据与模板，后续对话与配置归属该目录。  
2. **日常对话**：用户在「对话」页发送消息，选择模式（如 ask/plan）与模型，查看流式回复与历史会话。  
3. **管理技能**：在「技能」页浏览市场索引、安装/卸载/启用/禁用技能。  
4. **管理连接器**：在「连接器」页维护外部服务连接并测试连通性。  
5. **全局设置**：主题、语言、内置网关与模型鉴权等选项（持续演进）。  
6. **打包运行**：用户安装桌面制品即可使用；不依赖用户本机预装 OpenClaw CLI。

---

## 3. 从「脚本与启动链」反推的系统边界

本节按 **npm/Forge 脚本 → 主进程就绪顺序** 理解项目，便于与仓库实际行为对齐。

### 3.1 `package.json` 脚本映射的职责

| 脚本 | 命令 | 产品含义 |
|------|------|----------|
| `start` | `electron-forge start` | 开发态：Webpack 编译 Main/Renderer/Preload，启动 Electron，热更新/调试入口 |
| `package` | `electron-forge package` | 产出可运行目录（含 asar 等），验证打包路径 |
| `make` | `electron-forge make` | 生成各平台安装包/压缩包（Squirrel、ZIP、DEB、RPM 等） |
| `publish` | `electron-forge publish` | 发布流水线入口（若启用） |
| `lint` | `eslint --ext .ts,.tsx .` | 静态质量门禁 |
| `test` | `jest` | 单元/组件测试入口 |

**推论**：交付链路以 **Electron Forge + Webpack** 为中心；质量以 **ESLint + Jest** 为基线，CI 可在此基础上扩展（见路线图 M3）。

### 3.2 `forge.config.ts` 对产品的约束

- **Webpack 插件**：`mainConfig` 入口为 `src/index.ts`；Renderer 入口为 `src/renderer.tsx`，HTML 为 `src/index.html`，Preload 为 `src/preload.ts`。  
- **CSP（开发）**：允许 `connect-src` 到本机 `127.0.0.1` 的 `ws:` / `http:`，以支持 **GatewayDaemon** 与本地服务调试。  
- **Fuses**：打包期收紧 Electron 安全选项（如仅从 asar 加载、Cookie 加密等），影响**发布版**行为而非功能清单本身。  
- **其他打包钩子**：以仓库当前 `forge.config.ts` 为准；**产品能力不依赖**向外复制独立 OpenClaw CLI 包。若历史中曾存在复制 `openclaw-cli` 的钩子，视为工程遗留，可与「零 CLI」目标一并清理。

### 3.3 主进程 `app.whenReady()` 启动序列（逻辑顺序）

以下顺序描述 **Main** 在就绪后做了什么，对应「产品如何立即可用」：

1. **读取 Workspace 注册表**（`userData` 下 `cf.workspace.v1.json`），必要时执行一次性迁移标记。  
2. **确定当前激活工作区路径**：注册表中的 `active` 或默认路径（`userData/Default Workspace`）。  
3. **执行应用数据迁移/清理**（例如历史上工作区内 `.clawflow/openclaw` 与全局目录的合并策略——**目录名可能仍含 `openclaw` 字样，仅为兼容旧路径，不代表安装 CLI**）。  
4. **`ensureWorkspaceInitialized(active)`**：保证根目录存在、`workspace.json`、`.clawflow` 结构及代理角色模板等。  
5. **注册 IPC**：`workspace:*`、`engine:*` / `engineGateway:*` / `engineAuth:*`（ClawFlow 内置引擎与网关）、`gateway` 相关、`skillMarket:getIndex`、`app:*` 等；部分通道名可能仍带 `openclaw:` 前缀，**语义上属内置实现，不表示调用外置 CLI**。  
6. **`registerClawFlowIPC`**：绑定 **ClawFlowEngine**（会话存储、Provider 路由、工具运行时、可选 Web Search 配置）。  
7. **`GatewayDaemon.start()`（尽力而为）**：内置 HTTP/WebSocket 网关常驻，失败则记录警告。  
8. **创建主窗口**：加载 Webpack 提供的 Renderer URL，Windows 下自定义标题栏与菜单行为。  

**推论**：产品是 **「工作区先行」** 的——未正确初始化工作区时，对话与文件浏览等能力会受影响；切换工作区时会 **同步引擎根目录**、通知 Renderer，并在适当时机 **best-effort** 协调网关相关资源，避免跨工作区状态干扰。

### 3.4 Preload 能力面（对 PRD 的「对外接口」含义）

Renderer 仅能通过 **`window.electronAPI`** 调用下列能力类别（实现上为 `ipcRenderer.invoke` / 事件订阅）：

- **应用**：版本号、界面语言切换。  
- **窗口**：最小化/最大化/关闭、重载、DevTools、编辑快捷键代理。  
- **内置网关（主产品路径）**：`engineGateway:*` 与 GatewayDaemon 对应能力——状态、启停、日志等（以当前 preload 暴露为准）。  
- **ClawFlow 引擎**：会话 CRUD、发送消息、流式事件订阅、模型列表、鉴权配置与连接测试。  
- **技能 / 连接器**：列表与增删改及安装类操作（走主进程内置逻辑；IPC 名可能与历史命名并存）。  
- **技能市场**：拉取远端/缓存索引（`skillMarket:getIndex`）。  
- **工作区**：当前路径、最近列表、选择文件夹、目录列表、文件预览、在资源管理器中显示、创建目录、写入文本、重命名、删除、变更日志读写等。  
- **剪贴板**：写文本。  

**推论**：PRD 中的「功能模块」应以 **Preload 暴露集合** 与 **页面路由** 为验收锚点，避免文档描述 Main 私有逻辑而 UI 无法触达。

---

## 4. 功能需求

### 4.1 信息架构（页面）

| 路由 | 模块 | 说明 |
|------|------|------|
| `/chat` | 对话 | 默认首页；会话列表、输入区、流式展示、与工作区上下文关联 |
| `/skills` | 技能 | 技能市场索引、安装与启用状态管理 |
| `/connectors` | 连接器 | 连接器配置、测试与生命周期管理 |
| `/settings` | 全局设置 | 语言、主题、内置网关、模型鉴权等（持续迭代） |

系统菜单「视图」可提供与上述路由一致的导航（主进程向 Renderer 发送 `app:navigate`）。

### 4.2 工作区（Workspace）

**必须**

- 支持选择本地文件夹、列出最近工作区、切换当前工作区。  
- 切换后 Renderer 收到变更事件；主进程在切换后 **初始化** 目标工作区文件布局。  
- 在工作区根下维护 **`.clawflow/`**：元数据、会话存储路径、变更日志；应用级共享数据（如鉴权）可位于 `userData` 下 `.clawflow/`（路径命名可能保留历史片段，**不表示依赖 CLI**）。  

**应当**

- 提供目录浏览、文本文件预览（含大小/二进制限制）、在系统文件管理器中定位。  
- 提供受控的创建目录、写入文本、重命名、删除（路径限制在工作区内）。  

### 4.3 对话（内置 ClawFlowEngine）

**必须**

- 会话列表的持久化与删除；消息发送与历史展示。  
- **Ask 模式**下支持流式增量展示（IPC 事件推送 delta）。  
- 模型列表按已配置鉴权/可用性标注；支持多 Provider 路由。  

**应当**

- **Plan / Multitask** 等模式与工具运行时协同（多轮工具调用路径以引擎实现为准）。  
- 对话相关内容可写入工作区级 **变更日志**（便于用户回顾「本轮做了什么」）。  

### 4.4 鉴权与模型

**必须**

- 支持为各 Provider 维护多个 Profile（标签、环境类型元数据等）及 Active Profile。  
- 支持「测试连接」并返回可读错误信息。  
- Token 等敏感信息 **不** 暴露给 Renderer；使用主进程安全存储（如 `safeStorage` 路径下的存储抽象）。  

### 4.5 技能与连接器

**必须**

- 技能：查询列表、安装/卸载、启用/禁用；可拉取技能市场索引。  
- 连接器：列表、增删改、连接测试。  

**说明**：能力由 **主进程内置实现** 完成；PRD 要求 **UI 与管理闭环可用**，错误可感知、可恢复。

### 4.6 Gateway

**唯一产品语义**：由 **GatewayDaemon**（内置 HTTP + WebSocket）及 **`engineGateway:*` IPC** 提供的本地网关服务；用于状态展示、启停、实时消息通道等。

**必须**

- 用户能感知网关是否在监听、端口与基本状态；支持启动/停止/重启（以当前 IPC 为准）。  
- 停止网关时不应无声拖垮对话；应有日志或提示辅助排障。  

**不应**再要求用户理解或安装独立的「OpenClaw CLI Gateway」作为使用前提。

### 4.7 国际化与主题

**必须**

- 中文 / 英文界面可切换，且与主进程菜单标签同步（若适用）。  
- 明/暗主题与 Ant Design 主题令牌一致（见 `settingsStore` 与 `getAntdTheme`）。  

### 4.8 Web 搜索（可选工具能力）

- 引擎可配置 **Web Search**（环境变量与启动配置）：Provider（如 `auto` / `brave` / `duckduckgo`）、Brave API Key、总开关 `CLAWFLOW_WEB_SEARCH_DISABLED`。  
- 对用户表现为「在支持的场景下模型可引用检索」；具体触发条件以 `tool-runtime` / 模式策略为准。  

---

## 5. 非功能需求

| 类别 | 要求 |
|------|------|
| 安全 | `contextIsolation: true`，禁用 Renderer 直接 Node；路径操作限制在工作区根内解析 |
| 隐私 | 鉴权与密钥仅存主进程；日志避免打印完整 Token |
| 性能 | 流式输出低延迟；大文件预览需截断与二进制检测 |
| 兼容性 | Windows / macOS / Linux 打包配置已备；实际验证以 `make` 产物为准 |
| 可维护 | TypeScript 严格模式、ESLint；关键模块具备单测（持续补充） |

---

## 6. 运行环境与配置

### 6.1 必备/强依赖

- **Node/Electron 运行时**：由 Electron 打包提供。  
- **各模型 Provider 的可用凭证**（经应用内配置或环境变量）：用于内置引擎调用云端 API。  
- **不要求**：系统 PATH 中的 `openclaw`、独立 OpenClaw CLI 安装包或 vendor 捆绑 CLI。  

### 6.2 常见环境变量（非穷尽）

| 变量 | 作用 |
|------|------|
| `DEEPSEEK_API_KEY` / `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` | 各 Provider 默认密钥（可被鉴权存储覆盖） |
| `CLAWFLOW_WEB_SEARCH_PROVIDER` | Web 搜索 provider 选择 |
| `CLAWFLOW_WEB_SEARCH_DISABLED` | `1` 时关闭 Web 搜索 |
| `BRAVE_API_KEY` | Brave 搜索 API |

---

## 7. 发布与交付

- **开发**：`npm run start`。  
- **制品**：`npm run package` / `npm run make`；注意 `forge.config.ts` 中 `outDir` 带时间戳，避免 Windows 文件占用导致打包失败。  
- **交付前提**：干净环境安装制品后，**不依赖**用户额外安装 OpenClaw CLI 即可使用核心能力（对话、设置、内置网关等）。  

---

## 8. 里程碑与验收对齐

与 `04_ROADMAP.md` 一致摘要：

- **M0**：开发启动、主界面与 IPC 正常。  
- **M1（P0）**：对话闭环、技能/连接器管理、Gateway 状态与启停可用。  
- **M2（P1）**：设置与稳定性、错误提示与状态一致性。  
- **M3（P2）**：测试与 CI。  
- **M4**：签名与自动更新等发布增强（可选）。  

本 PRD 的模块级需求与 **M1/M2** 对齐；细节验收以 `06_TASKS.md` 中勾选项为准。

---

## 9. 明确非目标（当前版本）

- 不复刻任何第三方产品的像素级 UI。  
- 不在 Renderer 暴露任意文件系统读写或 shell 执行。  
- 不承诺云端账号体系（除非后续单独立项）。  
- **不将 OpenClaw CLI 作为产品依赖或用户安装步骤**。  

---

## 10. 术语表

| 术语 | 含义 |
|------|------|
| Workspace | 用户选择的本地根目录；其下 `.clawflow/` 存元数据与数据文件 |
| ClawFlowEngine | 应用内置对话引擎（Provider 路由、会话存储、工具运行时） |
| GatewayDaemon | 应用内置 HTTP/WebSocket 网关进程 |
| IPC | Electron 主进程与渲染进程间通信 |
| `.clawflow/openclaw`（若出现） | 可能仅为**磁盘路径/迁移兼容**命名；**不表示**已安装 OpenClaw CLI |

---

## 11. 修订记录

| 日期 | 变更说明 |
|------|----------|
| 2026-05-09 | 初版：基于 `package.json`、`forge.config.ts`、`src/index.ts` 启动链、Preload 能力面与核心模块反向梳理 |
| 2026-05-09 | 修订：明确 **已移除 OpenClaw CLI 依赖**；网关与技能/连接器以内置实现为准；目录名兼容说明 |
