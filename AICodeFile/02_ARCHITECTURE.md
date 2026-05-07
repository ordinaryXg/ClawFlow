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

- **Electron 三层**：Main（系统能力/执行 OpenClaw）→ Preload（安全桥）→ Renderer（React UI）
- **事实来源**：Gateway 是否运行应以 `openclaw gateway status` 为准，而不是仅靠内存进程句柄
- **接口入口**：Renderer 通过 `window.electronAPI` 调用 IPC，Main 侧用 `ipcMain.handle(...)` 注册

## 1. 高层概览

- **架构类型**：Electron 桌面端单体应用（**Main 进程 + Preload 安全桥 + React 渲染进程**），通过 **IPC** 通信。
- **核心能力**：UI 通过 `window.electronAPI` 调用主进程；主进程通过执行本机 **OpenClaw CLI**（`openclaw ...`）获取版本、查询状态并启停 Gateway。
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
    - 调用 `registerOpenClawIPC()` 注册 IPC

- **OpenClaw 引擎（执行本机 CLI / 进程管理）**
  - `src/engine/openclaw-engine.ts`
    - `OpenClawEngine` 接口
    - `OpenClawEngineImpl` 实现：通过 `child_process.exec/spawn` 执行 `openclaw` 命令
    - `registerOpenClawIPC()`：用 `ipcMain.handle(...)` 暴露 RPC

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
- **页面与组件**
  - `src/pages/DashboardPage.tsx`：仪表盘（版本、Gateway 状态、启停）
  - `src/components/Layout.tsx`：左侧导航 + 内容区（`<Outlet />`）
- **渲染进程类型声明**
  - `src/global.d.ts`：声明 `window.electronAPI` 的类型

### 2.3 状态管理（当前情况）

项目依赖中包含 `zustand`，但目前 `src/store/` 为空；页面状态主要用 `useState/useEffect` 管理（见 `src/pages/DashboardPage.tsx`）。

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
- `preload.js: ./src/preload.ts`

> 说明：`src/index.html` 当前仍是示例内容；若要完整启用 React 渲染，一般应提供包含 `#root` 的最小 HTML 外壳（详见“改进建议”）。

### 3.3 打包制品（来自 `forge.config.ts`）

- makers：Squirrel（Windows）、ZIP（darwin）、RPM/DEB（Linux）
- `packagerConfig.asar: true`
- fuses：在打包期对 Electron 功能进行启停（如仅从 asar 加载、启用 Cookie 加密等）

## 4. 核心数据流（典型调用链）

以「仪表盘点击 *启动 Gateway*」为例：

1. **UI 事件（Renderer）**
   - `src/pages/DashboardPage.tsx`：`handleStartGateway()` 调用 `window.electronAPI.startGateway()`
2. **Preload 桥接**
   - `src/preload.ts`：`ipcRenderer.invoke('openclaw:startGateway')`
3. **Main IPC Handler**
   - `src/engine/openclaw-engine.ts`：`ipcMain.handle('openclaw:startGateway', ...)`
4. **执行 OpenClaw CLI**
   - `OpenClawEngineImpl.startGateway()`：
     - `spawn('openclaw', ['gateway', 'start'], { detached: true, stdio: 'ignore' })`
     - `unref()` 并等待 2 秒 resolve

当前 IPC channel 约定如下（preload 与 main 侧需保持一致）：

- `openclaw:getVersion`
- `openclaw:getGatewayStatus`
- `openclaw:startGateway`
- `openclaw:stopGateway`

## 5. 外部依赖与运行前置条件

- **OpenClaw CLI**：主进程直接执行 `openclaw` 命令（见 `src/engine/openclaw-engine.ts`），因此需要运行环境中：
  - `openclaw` 已安装
  - 可在系统 `PATH` 中被找到（或后续引入可配置的路径）

## 6. 质量保障现状

- **ESLint**：`.eslintrc.json` + `npm run lint`
- **TypeScript**：`tsconfig.json`（严格模式），并通过 `fork-ts-checker-webpack-plugin` 在构建期做类型检查（见 `webpack.plugins.ts`）
- **测试/CI**：当前未发现测试目录与 CI 工作流（根目录无 `.github/workflows`）

## 7. 已知缺口与改进建议（面向后续演进）

- **HTML 外壳**：`src/index.html` 仍是 Hello World 示例，建议改为仅包含 `#root` 的外壳，避免与 React 渲染预期不一致。
- **DevTools 开关**：`src/index.ts` 默认 `openDevTools()`；建议按环境（dev/prod）控制。
- **Gateway 启动判定**：`startGateway()` 当前以“等待 2 秒”为成功标准；建议启动后再调用一次 `gateway status` 做确认。
- **进程状态一致性**：
  - `gatewayProcess` 仅内存保存，应用重启后无法追踪；
  - 建议把“是否运行”以 `openclaw gateway status` 的结果为准，UI 也应在启停后刷新状态。
- **配置化**：可引入集中配置（例如 OpenClaw 可执行路径、日志级别、窗口参数等），并提供示例配置文件。
- **测试与 CI**：补充最小的 lint/typecheck CI（以及关键引擎逻辑的单测/集成测试）以保证回归质量。

## 8. 关键文件索引（路径速查）

- **Main 入口**：`src/index.ts`
- **Preload**：`src/preload.ts`
- **Renderer 入口**：`src/renderer.tsx`
- **路由**：`src/App.tsx`
- **页面**：`src/pages/DashboardPage.tsx`
- **布局组件**：`src/components/Layout.tsx`
- **OpenClaw 引擎 + IPC 注册**：`src/engine/openclaw-engine.ts`
- **Forge 配置**：`forge.config.ts`
- **Webpack 配置**：`webpack.main.config.ts`、`webpack.renderer.config.ts`、`webpack.rules.ts`、`webpack.plugins.ts`


