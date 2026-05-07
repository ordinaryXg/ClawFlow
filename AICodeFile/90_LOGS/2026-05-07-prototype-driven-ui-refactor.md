---
title: 基于 prototype 的 UI 重构与 PRD 回写
date: 2026-05-07
scope: UI/IA/PRD
status: done
---

## 背景

本次以 `${REPO_ROOT}/AICodeFile/prototype/index.html` 为“交互与视觉的事实来源”，把项目 UI 重构为 **深色极简主题（灰 + 暗绿 + 暗金）**，并将关键规范回写到 PRD。

## 变更摘要

- **全局主题与布局**
  - `src/index.css` 引入主题 token（CSS 变量），默认深色极简
  - `src/styles/ui.css` 提供 Sidebar / Card / Button / Chip / Banner 等基础样式
  - `src/components/Layout.tsx` 重构为原型侧栏布局，并在侧栏底部展示 Gateway 状态（点击刷新）
  - `src/components/common/ToastHost.tsx` 新增统一 Toast（success/error）
  - `src/renderer.tsx` 引入 UI 样式

- **路由补齐**
  - `src/App.tsx` 新增 `Settings` 与 `States` 路由

- **页面重构（对齐 prototype）**
  - Dashboard：卡片化概览 + OpenClaw 缺失 Banner + Gateway 启停/刷新 + 快捷入口
  - Chat：会话列表 + 消息区 + 输入区（Enter/Shift+Enter）+ 流式展示（store 内仍为模拟流式）
  - Skills：搜索/筛选 + 卡片式技能条目 + 安装/卸载/启用/禁用反馈
  - Connectors：左列表/右详情 + 抽屉（新增/编辑）+ 删除确认弹窗 + 测试连接反馈 + 脱敏显示/隐藏
  - Settings：主题/语言/路径/超时/日志级别等（UI 先对齐原型，真实校验交由主进程）
  - States：空/错/载状态库页

- **PRD 回写**
  - `AICodeFile/03_PRD.md`：补充“可视化原型入口、视觉 token、核心组件与状态策略”，并补齐验收项（Gateway 启停后强制刷新一致）。

## 验收点（快速自测）

- [ ] 应用启动后侧栏与整体主题正确（深色极简）
- [ ] 路由可到达：Dashboard/Chat/Skills/Connectors/Settings/States
- [ ] Dashboard：OpenClaw 缺失提示 + CTA 可进入 Settings
- [ ] Chat：发送 → 流式输出展示；错误提示可清除
- [ ] Skills：筛选/安装/启用/卸载均有可感知反馈（Toast）
- [ ] Connectors：抽屉保存校验（Token 不能为空）；测试连接有成功/失败提示；删除确认弹窗可用
- [ ] Settings：主题/语言切换有反馈；OpenClaw path 错误态与指引可见

## 备注

- 当前仍保留部分旧样式/antd 相关依赖与组件文件（未作为本次重构的阻断项）；后续可做一次“瘦身清理”。

