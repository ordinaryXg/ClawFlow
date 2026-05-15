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
    workspace/            # 工作区注册表、资源管理器、Git、技能、布局与引导
    sub-agent/            # 子代理槽位、运行、快照、广播
    todo/                 # 待办触发器
    scrape/               # 网页抓取任务
    skill/                # Skill Agent；轮次 totalUserManualRounds 与进化触发见 skill-evolution-scheduler.ts
    shell/                # 托盘、主窗偏好、图标、桌面钉、主壳工作区记忆
    prefs/                # messaging-prefs、web-search-prefs、app-cache-prefs（userData 持久化）
  engine/                 # ClawFlow 引擎、Gateway、Provider、tool-runtime
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
4. **尽早注册的 IPC**：`registerShellViewWindowIPC`、`registerWorkspaceImportExternalPathsIPC`、`registerWorkspaceStatAbsolutePathIPC`、`registerAppPathAndIconIPC`、`registerTodoTriggersIPC`、`registerSubAgentsIPC`、`registerScrapeIPC`（避免渲染进程 invoke 早于 `whenReady` 链尾部）。
5. **`registerWorkspaceIPC()`**：工作区、剪贴板、Hermes 技能列表等大段 handler。
6. **`registerWindowControlIpcOnce` / `buildBaseBrowserWindow` / `registerStickySatelliteIPC`**：窗口与卫星便签。
7. **`app.whenReady()`**：读偏好、初始化工作区、注册引擎 IPC、Gateway、`createWindow()`、飞书长连等。

应用菜单与菜单语言：`src/main/application-menu.ts`（`setupApplicationMenu`、`getAppLanguage`、`setAppLanguageFromRenderer`）。

后续可将与 `index.ts` 强耦合的大段 IPC 按域迁到 `src/main/ipc/` 或 `src/main/windows/`，每迁一块跑一次 `npm start` 与关键路径手测。

## 渲染层

- 路由与布局：`App.tsx`、`components/Layout.tsx`、`WorkspaceSidebar.tsx`。
- 聊天 UI：`components/chat/`。
- 设置页：`pages/SettingsPage/`（含飞书、网络搜索等偏好）。

## IPC 约定

- Channel 多为 **`领域:动作`**（如 `workspace:listDir`、`subAgents:run`）。
- 工作区相对路径类 API 通常先 `resolveWorkspaceRootForWebContents(event.sender)` 再操作磁盘。
- **`.agent/`**、**`.subagent/`** 物理位于**工作区根目录**（便于 `.gitignore` 与仓库迁移）；**`.clawflow-launcher-stash/`** 仅在应用缓存根下 `workspaces/<sha256>/`（默认 `userData/ClawFlowAppCache`，见 `workspace-blob-store.ts`），不随仓库同步。启动或初始化时会将根下遗留 stash 迁入缓存、将旧版留在缓存内的 `.agent`/`.subagent` 迁回工作区根；并合并曾误放在 `userData` 根等处的 `workspaces/` 子树。

## 常用命令

```bash
npm start          # electron-forge 开发模式
npm run lint
npm test
```

## 环境变量（节选）

主进程 `registerClawFlowIPC` 会读取如 `CLAWFLOW_WEB_SEARCH_*`、`BRAVE_*` 等；详见 `index.ts` 中 `app.whenReady` 内 `registerClawFlowIPC` 调用处。
