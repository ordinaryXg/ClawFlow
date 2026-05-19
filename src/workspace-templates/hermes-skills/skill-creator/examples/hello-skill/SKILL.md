---
name: hello-skill
description: Hermes 示例技能：演示 SKILL.md 基本结构。触发词：hello、你好、测试技能。
version: 1.0.0
author: ClawFlow
category: example
tags: [example, demo, beginner]
agent_created: true
---

# Hello Skill — 示例 Hermes 技能

_用于学习 `.agent/.skills/` 目录约定与 ClawFlow 技能工具的极简示例。_

## 快速开始

**用户输入：** `hello` / `你好` / `测试技能`

**AI 行为：** 返回简短问候，并提示用户阅读 `skill-creator` 创建自己的技能。

## 触发词

- `hello`、`你好`、`测试技能`、`demo`

## 工作流程

1. 识别触发词
2. 用中文或英文回复问候
3. 建议下一步：阅读 `.agent/.skills/skill-creator/SKILL.md`

## 示例

**用户：** `你好`

**助手：**
```
你好！这是 hello-skill 示例。若要创建正式技能，请让助手按 skill-creator 流程使用 workspace_skill_create。
```

## 安全考虑

- 无命令执行、无外链请求、无密钥 — P0/P1 均为通过项。

## Changelog

### [1.0.0] - 2026-05-19
- 初始示例
