# 便签壳 / 卫星窗

| 字段 | 值 |
|------|-----|
| **功能 ID** | `sticky-shell` |
| **状态** | 已落地 |
| **完成度** | 85% |
| **优先级** | P1 |
| **最后更新** | 2026-07-21 |

## 1. 功能概述

alternate 便签玻璃壳（`StickyNoteShell`）与卫星独立窗口：紧凑 UI、中心 Tab（chat / scheduling / kb）、工作区拖出为卫星窗并可合并回主壳。

## 2. 用户场景

1. 切换 shell 模式为 `alternate` → 紧凑便签 UI
2. 中心 Tab 在聊天、周期调度、知识库间切换
3. 拖出工作区到独立 `BrowserWindow`（卫星窗）
4. `sticky:mergeSatellite` 合并回主壳；`sticky:detachedPaths` 同步状态

## 3. 实现进度

### 已落地

- [x] 便签玻璃壳（`cf-stickyGlassRoot`、`window:setShellViewAppearance({ compact: true })`）
- [x] 中心 Tab：`chat` | `scheduling` | `kb`（嵌入 `KnowledgeBaseHubPanel`）
- [x] 卫星窗 IPC：`sticky:openSatellite`、`sticky:mergeSatellite` 等
- [x] 主壳工作区 bump（分离后避免 IPC 仍指向旧工作区）
- [x] `StickyDesktopDock` FAB
- [x] `StickyFileStrip` 等文件条替代标准右栏

### 部分落地

- [ ] 便签壳无 `skills` Tab（需走 `/skills` 或切回标准壳）

### 未实现 / 待完善

- [ ] 便签壳 skills Tab 或 Dock 快捷入口（见 [product/ux-prototype.md](../product/ux-prototype.md) 附录 A.1）
- [ ] 卫星窗下周期调度/飞书 Toast 行为文档化

## 4. 架构与数据

| 概念 | 说明 |
|------|------|
| Shell 模式 | `useShellViewStore`（`clawflow.shellViewMode`） |
| 卫星绑定 | `stickySatellitePathByWindowId` |
| IPC | `main/ipc/register-sticky-satellite-ipc.ts` |

## 5. 入口与代码证据

| 类型 | 路径 / 符号 |
|------|-------------|
| 壳组件 | `components/sticky/StickyNoteShell.tsx` |
| Dock | `components/sticky/StickyDesktopDock.tsx` |
| 文件条 | `components/sticky/StickyFileStrip.tsx` |
| 主进程 | `main/sticky-satellite-windows.ts` |
| 布局 | `components/Layout.tsx`（alternate 分支） |

## 6. 关联文档

- [shell-ui.md](./shell-ui.md) — 标准壳 vs 便签壳对照
- [knowledge-base.md](./knowledge-base.md) — 便签 `kb` Tab
- [product/ux-prototype.md](../product/ux-prototype.md) — §3.2、§3.3
