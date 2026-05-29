# ClawFlow — 仓库指南（面向协作者与 AI）

Electron + React 桌面应用；主进程集中注册大量 IPC，渲染进程为聊天 / 工作区 / 技能等 SPA。

## 入口与构建

| 角色 | 源码路径 | 说明 |
|------|----------|------|
| 主进程 | `src/index.ts` | Webpack `entry`（`webpack.main.config.ts`）。体积大：窗口生命周期 + 多数 `ipcMain.handle`。 |
| 渲染进程 | `src/renderer.tsx` → `src/App.tsx` | Forge `entryPoints`（`forge.config.ts`）。 |
| Preload | `src/preload.ts` | 与渲染层约定安全的 `contextBridge` API。 |
| Forge / Webpack | `forge.config.ts`, `webpack.*.config.ts` | 打包、CSP、主进程 external（如 `ws`、`better-sqlite3`、飞书 SDK）。 |

## 路径别名（Webpack + tsconfig）

- `@/*` → `src/*`
- `@main/*` → `src/main/*`（主进程可拆出的独立模块，见 `src/main/`）

Webpack 已配置 `resolve.alias`；`tsconfig` 的 `paths` 供 IDE 与类型检查。若 ESLint 对 `@main/...` 报 `import/no-unresolved`，可改用相对路径 `./main/...`，或为项目增加 `eslint-import-resolver-typescript`。

## `src/` 目录心智模型

```
src/
  index.ts              # 主进程 Webpack 入口（IPC / 窗口）
  renderer.tsx, App.tsx, preload.ts, index.html
  main/                   # 主进程业务模块（原根目录零散 *.ts 已迁入子目录）
    application-menu.ts
    electron-workspace-context.ts
    sticky-satellite-windows.ts
    workspace/            # 注册表、`.agent` 引导、Git、技能；`active-workspace-sync.ts` 统一活动根
    ipc/                  # workspace-ipc.ts、register-scheduling-scrape-ipc.ts 等
    broadcast/            # 按工作区向窗口广播（workspace-window-broadcast.ts）
    system-agents/        # 应用缓存内 Skill / 认知分配 / 预期规划
    scheduling/           # 周期调度触发器
    scrape/               # 网页抓取任务
    skill/                # Skill Agent；轮次 totalUserManualRounds 与进化触发见 skill-evolution-scheduler.ts
    shell/                # 托盘、主窗偏好、图标、桌面钉、主壳工作区记忆
    prefs/                # messaging-prefs、web-search-prefs、app-cache-prefs（userData 持久化）
  engine/                 # ClawFlow 引擎、engine-ipc.ts、Gateway、Provider、tool-runtime
  messaging/              # 飞书等
  components/, pages/, store/
  shared/                 # 类型、纯函数；含 workspace-preview-limits、intelligence-profile
  locales/, utils/, workspace-templates/
```

`engine/`、`messaging/` 通过 `../main/workspace/...`、`../main/prefs/...` 等引用主进程模块。

## `src/index.ts` 内部怎么读

按**大致顺序**浏览即可，不必一次读完：

1. 顶层 `import`：依赖的引擎、工作区、子代理、抓取、托盘、消息等模块。
2. **`registerMessagingIPC()`**：在 `app.whenReady` 之前执行（注释说明原因）。
3. **便签 / 壳紧凑布局**：`shellCompactByWindowId`、`broadcastStickyDetachedPaths`、`bumpMainShellWorkspaceIfSameAsSatelliteBinding`、`applyWorkspaceForFocusedWindow`。
4. **尽早注册的 IPC**（`main/ipc/`）：`registerShellViewWindowIPC`、`registerWorkspaceEarlyIPC`、`registerAppPathAndIconIPC`；周期调度/抓取见 `register-scheduling-scrape-ipc.ts`（避免渲染进程 invoke 早于 `whenReady` 链尾部）。
5. **`registerWorkspaceIPC()`**（`workspace-ipc.ts`）：工作区、剪贴板、Hermes 技能、记忆 FTS 等 handler。
6. **`registerWindowControlIpcOnce` / `buildBaseBrowserWindow` / `registerStickySatelliteIPC`**：窗口与卫星便签（卫星 IPC 在 `register-sticky-satellite-ipc.ts`）。
7. **`app.whenReady()`**：`loadMainUiPrefsOnStartup`、`applyActiveWorkspace`（勿手写 `setActiveWorkspace` + `syncActiveWorkspaceRootToEngine`）、`registerClawFlowIPC`、`registerGatewayIPC`、`registerAppSettingsIPC`、`createWindow()`、飞书长连等。

应用菜单与菜单语言：`src/main/application-menu.ts`（`setupApplicationMenu`、`getAppLanguage`、`setAppLanguageFromRenderer`）。

活动工作区切换请用 `main/workspace/active-workspace-sync.ts`（`applyActiveWorkspace` / `syncActiveWorkspaceRootToEngine`），勿在多处手写 `setActiveWorkspaceRoot` + `syncClawFlowEngineWorkspaceRoot`。

引擎 IPC 见 `engine/engine-ipc.ts`（`registerClawFlowIPC`）；`index.ts` 在 `whenReady` 内调用。

### 聊天传输（渲染 → 引擎）

| 路径 | 何时使用 | 实现 |
|------|----------|------|
| **主路径** | Electron 桌面端且存在 `engineGateway*` IPC | `store/modules/chat-gateway-client.ts` → Gateway WebSocket（`chat:send` / 流式 delta） |
| **回退** | 无 WebSocket 或 Gateway IPC（如纯浏览器调试） | `engine:sendMessage`（`chatStore` 非流式 + 前端 reveal 动画） |

新功能应只扩展 Gateway WS 协议；`engine:sendMessage` 保留作兼容，不新增并行行为。

工具注册：`engine/tool-runtime-core.ts`（`ToolRuntime` 类）+ `tool-runtime-default-tools.ts`（`createDefaultToolRuntime`）。

## 渲染层

- 路由与布局：`App.tsx`、`components/Layout.tsx`、`WorkspaceSidebar.tsx`。
- 聊天 UI：`components/chat/`。
- 设置页：`pages/SettingsPage/`（含飞书、网络搜索等偏好）。

## IPC 约定

- Channel 多为 **`领域:动作`**（如 `workspace:listDir`、`scheduleTriggers:list`）。
- 工作区相对路径类 API 通常先 `resolveWorkspaceRootForWebContents(event.sender)` 再操作磁盘。
- **`.agent/`** 位于**工作区根目录**；**`.clawflow-launcher-stash/`** 在应用缓存 `workspaces/<sha256>/`（见 `workspace-blob-store.ts`）。应用启动时**不**自动创建或绑定工作区；用户从侧栏添加文件夹后才会 `setActive`。打开工作区时会迁移 stash、清理遗留 **`.subagent/`**（工作区委派已移除；系统子 Agent 在应用缓存）。

## 常用命令

```bash
npm start          # electron-forge 开发模式
npm run lint
npm test           # 依赖 better-sqlite3 的用例在 Node ABI 不匹配时会 skip（见 test-support/can-load-better-sqlite3.ts）
npm run rebuild:native   # Jest 需与本地 Node 对齐 native 模块时
```

## 环境变量（节选）

主进程 `registerClawFlowIPC`（`engine/engine-ipc.ts`）会读取如 `CLAWFLOW_WEB_SEARCH_*`、`BRAVE_*` 等；详见 `index.ts` 中 `app.whenReady` 内调用处。
