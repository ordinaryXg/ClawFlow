# ClawFlow 项目架构说明（AI 可读）

## 元信息

- **适用对象**：首次接入的 AI / 新同学 / 需要定位边界与关键文件的人
- **仓库根目录占位**：`${REPO_ROOT}`
- **本文件角色**：描述“系统怎么分层、关键调用链、关键文件在哪里”
- **关联文档**：
  - 入口索引：`00_INDEX.md`
  - 项目总览：`01_PROJECT_OVERVIEW.md`
  - 路线图：`04_ROADMAP.md`
  - 任务清单：`06_TASKS.md`

本文档用于梳理当前 `ClawFlow` 的整体架构、分层边界与关键代码位置，便于新同学快速上手与后续演进。

## TL;DR（3 分钟理解）

- **Electron 三层**：Main（系统能力 / 内置引擎与网关）→ Preload（安全桥）→ Renderer（React UI）
- **事实来源**：内置网关是否可用以 **GatewayDaemon 监听状态** 与 **`engineGateway:*` IPC** 为准（不依赖外置 CLI 的 `gateway status`）
- **接口入口**：Renderer 通过 `window.electronAPI` 调用 IPC，Main 侧用 `ipcMain.handle(...)` 注册

## 1. 高层概览

- **架构类型**：Electron 桌面端单体应用（**Main 进程 + Preload 安全桥 + React 渲染进程**），通过 **IPC** 通信。
- **核心能力**：UI 通过 `window.electronAPI` 调用主进程；对话、模型路由、技能/连接器与内置网关由 **ClawFlowEngine**、**GatewayDaemon** 及主进程其他模块实现。**产品不依赖 OpenClaw CLI**。
- **构建/打包**：Electron Forge + Webpack（Forge Webpack 插件），构建产物目录为 `.webpack/`。

## 2. 代码与模块分布

### 2.1 顶层结构

- `package.json`：依赖与脚本（start/package/make/publish/lint），入口 `main: ".webpack/main"`
- `forge.config.ts`：Electron Forge 配置（makers、webpack 插件、fuses）
- `webpack.main.config.ts`：Main 进程 Webpack 配置（入口 `src/index.ts`）
- `webpack.renderer.config.ts`：Renderer 进程 Webpack 配置（入口点在 `forge.config.ts` 里声明）
- `tsconfig.json`：TypeScript 编译器配置
- `.eslintrc.json`：ESLint 规则
- `src/`：应用源代码
- `.webpack/`：构建产物（由 Forge Webpack 输出）

### 2.2 三进程分层（Electron 标准分层）

#### Main 进程（系统能力层 / 后端层）

- **入口与窗口生命周期**
  - `src/index.ts`
    - 创建 `BrowserWindow`
    - 加载 `MAIN_WINDOW_WEBPACK_ENTRY`
    - 注册 Workspace IPC、`registerClawFlowIPC`、`registerGatewayIPC` 等；应用启动时尽力启动 **GatewayDaemon**

- **ClawFlow 内置对话引擎**
  - `src/engine/clawflow-engine.ts`
    - 会话存储、多 Provider 路由、工具运行时、流式输出等
    - `registerClawFlowIPC()`：暴露 `engine:*`、`engineAuth:*` 等

- **内置网关**
  - `src/engine/gateway-daemon.ts`
    - 本地 HTTP + WebSocket；`registerGatewayIPC()` 与 `engineGateway:*` 等协同（以代码为准）

- **历史/兼容说明**：若仓库中仍存在 `src/engine/openclaw-engine.ts` 或名为 `openclaw:*` 的 IPC，**不应**理解为「用户必须安装 OpenClaw CLI」。产品语义以 **内置引擎 + GatewayDaemon** 为准；遗留模块与通道名可随重构移除或统一重命名。

#### Preload（安全边界层）

- `src/preload.ts`
  - `contextBridge.exposeInMainWorld('electronAPI', ...)`
  - 使用 `ipcRenderer.invoke(...)` 访问主进程的 IPC handler
  - 在 `contextIsolation: true` 下提供受控 API（避免在渲染进程打开 Node 能力）

#### Renderer（UI 层）

- **入口**
  - `src/renderer.tsx`：挂载 React Root，渲染 `<App />`
- **路由**
  - `src/App.tsx`：`HashRouter` + `Routes`
- **页面（示例）**
  - `src/pages/ChatPage.tsx`、`SkillsPage`、`ConnectorsPage`、`SettingsPage`
  - `src/components/Layout.tsx`：左侧导航 + 内容区（`<Outlet />`）
- **渲染进程类型声明**
  - `src/global.d.ts`：声明 `window.electronAPI` 的类型

### 2.3 状态管理（当前情况）

使用 **zustand** 等模块化管理设置、会话与 Store（见 `src/store/modules/`）；页面可组合 hooks 与局部 `useState`。

## 3. 启动、构建与发布

### 3.1 常用命令（来自 `package.json`）

- **开发运行**：`npm run start` → `electron-forge start`
- **打包**：`npm run package` → `electron-forge package`
- **制品制作**：`npm run make` → `electron-forge make`
- **发布**：`npm run publish` → `electron-forge publish`
- **Lint**：`npm run lint` → `eslint --ext .ts,.tsx .`

### 3.2 Forge Webpack 入口点（来自 `forge.config.ts`）

- `html: ./src/index.html`
- `js: ./src/renderer.tsx`
- `preload: ./src/preload.ts`

### 3.3 打包制品（来自 `forge.config.ts`）

- makers：Squirrel（Windows）、ZIP（darwin）、RPM/DEB（Linux）
- `packagerConfig.asar: true`
- fuses：在打包期对 Electron 功能进行启停（如仅从 asar 加载、启用 Cookie 加密等）

## 4. 核心数据流（典型调用链）

以「设置页启动内置网关」为例：

1. **UI 事件（Renderer）**：调用 `window.electronAPI.engineGatewayStart(...)`（以 `preload.ts` 实际导出为准）
2. **Preload 桥接**：`ipcRenderer.invoke('engineGateway:start', ...)`
3. **Main**：`gateway-daemon` / 相关 handler 启动监听，返回成功状态
4. **UI 刷新**：再次 `engineGatewayStatus` 或订阅事件，展示端口与运行状态

对话流式输出：`engine:sendMessageStream` + `onEngineChatStream` 推送 delta（详见 `preload.ts` 与 `clawflow-engine.ts`）。

## 5. 外部依赖与运行前置条件

- **模型 API**：DeepSeek / OpenAI / Anthropic 等凭证经内置鉴权存储或环境变量提供
- **不要求**：系统安装 `openclaw` CLI 或单独 OpenClaw 运行时

## 6. 质量保障现状

- **ESLint**：`.eslintrc.json` + `npm run lint`
- **TypeScript**：`tsconfig.json`（严格模式），并通过 `fork-ts-checker-webpack-plugin` 在构建期做类型检查（见 `webpack.plugins.ts`）
- **测试**：`jest` + 部分模块单测（如 `src/engine/providers/model-id.test.ts`）；CI 可按路线图扩展

## 7. 已知缺口与改进建议（面向后续演进）

- **文档与代码一致**：清理仍提及「必须安装 OpenClaw」的 i18n 与注释；统一 IPC 命名（减少 `openclaw:` 前缀误导）
- **Gateway 启停反馈**：以实际 `listening` 状态与错误信息为准，完善 UI 提示
- **测试与 CI**：补充最小的 lint/typecheck CI 与关键引擎逻辑单测以保证回归质量

## 8. 关键文件索引（路径速查）

- **Main 入口**：`src/index.ts`
- **Preload**：`src/preload.ts`
- **Renderer 入口**：`src/renderer.tsx`
- **路由**：`src/App.tsx`
- **内置对话引擎**：`src/engine/clawflow-engine.ts`
- **内置网关**：`src/engine/gateway-daemon.ts`
- **工作区服务**：`src/workspace-service.ts`
- **Forge 配置**：`forge.config.ts`
- **Webpack 配置**：`webpack.main.config.ts`、`webpack.renderer.config.ts`、`webpack.rules.ts`、`webpack.plugins.ts`

