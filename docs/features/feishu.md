# 飞书集成

| 字段 | 值 |
|------|-----|
| **功能 ID** | `feishu` |
| **状态** | 已落地 |
| **完成度** | 80% |
| **优先级** | P1 |
| **最后更新** | 2026-07-21 |

## 1. 功能概述

飞书（Lark）双通道集成：**入站**多 Bot WebSocket 长连桥接到工作区会话；**出站**经 bundled `lark-cli` 调用 Open Platform API（文档、表格、Drive、Wiki、IM 等）。

## 2. 用户场景

1. 设置 integrations 配置多 Bot → 启动 `lark-bridge` 长连
2. 飞书消息入站 → 桥接到指定工作区会话 → AI 回复
3. 对话中模型调用 `workspace_feishu_invoke` 操作飞书云文档/表格
4. 周期调度生成报告 → 推送飞书（配合调度与抓取）

## 3. 实现进度

### 已落地

- [x] 多 Bot 配置（`feishuBots[]`，`messaging-prefs.ts`）
- [x] 入站桥接（`messaging/lark-bridge-service.ts`）
- [x] IPC：`messaging:*`
- [x] 工具 `workspace_feishu_invoke` → `main/lark-cli/`
- [x] 设置 UI：`FeishuSettingsPanel`
- [x] 跨工作区脏标记：`chat:conversationsDirty`
- [x] lark-cli 白名单与安全封装

### 部分落地

- [ ] 部分 messaging 渠道仍为 `PLACEHOLDER_MESSAGING_CHANNELS` 占位

### 未实现 / 待完善

- [ ] 除飞书外的其他 IM 渠道
- [ ] 飞书卡片 / 富文本 outbound 模板
- [ ] Bot 权限最小化向导

## 4. 架构与数据

| 组件 | 路径 |
|------|------|
| 桥接服务 | `messaging/lark-bridge-service.ts` |
| 入站解析 | `messaging/feishu-inbound-parse.ts` |
| lark-cli | `main/lark-cli/*`、`resources/lark-cli/` |
| 偏好 | `main/prefs/messaging-prefs.ts` |

## 5. 入口与代码证据

| 类型 | 路径 / 符号 |
|------|-------------|
| IPC 注册 | `messaging/register-messaging-ipc.ts` |
| 工具 | `workspace_feishu_invoke` in `tool-runtime-default-tools.ts` |
| 白名单 | `main/lark-cli/lark-cli-whitelist.ts` |
| 设置 | `pages/SettingsPage/FeishuSettingsPanel.tsx` |
| 技能 bootstrap | `main/lark-cli/lark-cli-skills-bootstrap.ts` |

## 6. 关联文档

- [workspace-tools.md](./workspace-tools.md) — feishu manifest 与工具
- [chat-engine.md](./chat-engine.md) — 桥接会话
- [product/ux-prototype.md](../product/ux-prototype.md) — integrations 设置
