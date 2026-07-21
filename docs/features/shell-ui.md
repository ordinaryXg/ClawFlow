# 壳层与全局体验

| 字段 | 值 |
|------|-----|
| **功能 ID** | `shell-ui` |
| **状态** | 已落地 |
| **完成度** | 80% |
| **优先级** | P1 |
| **最后更新** | 2026-07-21 |

## 1. 功能概述

应用壳层 UI 与全局体验：标准三栏布局、工作区 Hub 四分支、Titlebar/Toast/ErrorBoundary、FAB、托盘与桌面钉、国际化与主题。

## 2. 用户场景

1. 标准壳：侧栏 + 主内容 + 右栏（文件/变更/抓取）
2. Hub 分支切换：sessions / scheduling / skills / kb
3. 窄屏顶栏模式（&lt;980px 无右栏）
4. 系统托盘、桌面钉隐藏、智能档案 FAB

## 3. 实现进度

### 已落地

- [x] 标准三栏壳（可拖拽分栏宽度，localStorage 持久化）
- [x] 工作区 Hub 四分支（`workspaceHubStore`）
- [x] 路由：`/chat`、`/skills`、`/settings`（`/` → `/chat`）
- [x] `Titlebar`、`ToastHost`、`ErrorBoundary`
- [x] `BottomShellFabs`、`ManualEvolutionFab`、`IntelligenceProfileButton`
- [x] `SendPipelineStatusBar`、上下文环非账单文案
- [x] 托盘 / 桌面钉（`main/shell/`）
- [x] i18next 中英文（`locales/*`、`app:setLanguage`）
- [x] 主题/字号（设置 system 分区）

### 部分落地

- [ ] 窄屏能力矩阵文档化（右栏三 Tab 不可用时的替代入口）
- [ ] Hub skills vs `/skills` 引导 tooltip

### 未实现 / 待完善

- [ ] 独立 Dashboard 页（已合并到 `/settings`）
- [ ] 移动端完整体验

## 4. 架构与数据

### 标准壳 vs 便签壳

| 能力 | 标准壳 | 便签壳 |
|------|--------|--------|
| Hub 四分支 | 有 | 简化标签条 |
| 右栏三 Tab | 桌面宽屏有 | 无 |
| FAB | `BottomShellFabs` | `StickyDesktopDock` |

详见 [sticky-shell.md](./sticky-shell.md) 与 [product/ux-prototype.md](../product/ux-prototype.md)。

## 5. 入口与代码证据

| 类型 | 路径 / 符号 |
|------|-------------|
| 布局 | `components/Layout.tsx` |
| 侧栏 | `components/WorkspaceSidebar.tsx` |
| Hub Store | `store/modules/workspaceHubStore.ts` |
| 右栏 | `components/chat/ChatRightTabs.tsx` |
| 路由 | `App.tsx` |
| 菜单 | `main/application-menu.ts` |
| UI 偏好 | `main/shell/main-ui-prefs.ts` |

## 6. 关联文档

- [sticky-shell.md](./sticky-shell.md) — 便签壳详情
- [product/ux-prototype.md](../product/ux-prototype.md) — 完整 IA
- [scheduling.md](./scheduling.md) — Hub scheduling 分支
