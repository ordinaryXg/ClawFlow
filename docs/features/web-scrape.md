# 网页抓取

| 字段 | 值 |
|------|-----|
| **功能 ID** | `web-scrape` |
| **状态** | 已落地 |
| **完成度** | 70% |
| **优先级** | P1 |
| **最后更新** | 2026-07-21 |

## 1. 功能概述

HTTP 网页抓取能力：模型工具 `web_scrape` 将内容保存到工作区，右栏 Scrape 面板展示任务列表与全文工件。

## 2. 用户场景

1. 对话中模型调用 `web_scrape` 抓取 URL
2. 右栏 `scrape` Tab 查看历史抓取记录
3. 周期调度到点自动抓取 + 分析（配合 [scheduling.md](./scheduling.md)）

## 3. 实现进度

### 已落地

- [x] 工具 `web_scrape`（manifest: `web_scrape`）
- [x] 工件目录：`${WORKSPACE}/.agent/.clawflow/scrapes/`
- [x] UI：`ScrapePanel`（ChatRightTabs）
- [x] IPC：`scrape:*`、事件 `scrape:jobsUpdated`
- [x] 服务：`scrape-service.ts`、`scrape-runner.ts`

### 未实现 / 待完善

- [ ] SPA / 动态页面渲染
- [ ] robots.txt 遵守与礼貌爬取
- [ ] 速率限制与并发控制
- [ ] 抓取结果结构化摘要

## 4. 架构与数据

| 路径 | 用途 |
|------|------|
| `.agent/.clawflow/scrapes/` | 抓取工件存储 |
| IPC | `main/ipc/register-scheduling-scrape-ipc.ts` |

## 5. 入口与代码证据

| 类型 | 路径 / 符号 |
|------|-------------|
| 运行器 | `main/scrape/scrape-runner.ts` |
| 服务 | `main/scrape/scrape-service.ts` |
| 广播 | `main/scrape/scrape-broadcast.ts` |
| 类型 | `shared/scrape-jobs.ts` |
| UI | `components/chat/ScrapePanel.tsx` |

## 6. 关联文档

- [workspace-tools.md](./workspace-tools.md) — `web_scrape` 注册
- [scheduling.md](./scheduling.md) — 定时抓取
- [product/prd.md](../product/prd.md) — 自动化工作流场景
