---
name: skill-creator
description: ClawFlow 元技能：在当前工作区 .agent/.skills/ 创建、优化、审核其它 Hermes 技能。提供模板、最佳实践、安全清单与 validate_skill.py。触发：创建技能、写 SKILL、优化技能、审核技能。
version: 2.0.0
author: ClawFlow
category: meta
tags: [skill-management, meta, hermes, clawflow, best-practices]
agent_created: false
---

# Skill-Creator — 技能创建器（ClawFlow / Hermes）

_用于创建其它技能的元技能。结构对齐 WorkBuddy `skills-creator`：本目录含 `templates/`、`examples/`、`scripts/`。_

## 包结构（本目录）

```
.agent/.skills/skill-creator/
├── SKILL.md              ← 你正在阅读的主说明（FTS 索引）
├── _meta.json            ← 元数据（版本、标签）
├── templates/
│   └── SKILL.md.template ← 新建技能时复制改写
├── examples/
│   └── hello-skill/      ← 最小可运行示例
└── scripts/
    └── validate_skill.py ← 本地校验 SKILL.md
```

新建工作区（磁盘上尚无 `.agent/`）时，ClawFlow **一次性** 写入上述 v2 包；打开既有工作区不会自动补写或升级。

---

## 快速开始 (Quick Start)

### 创建新技能

**用户说：**
```
帮我创建一个技能，用来固化 XXX 工作流
```

**执行流程：**
1. 澄清：技能名（目录名）、触发场景、是否需要 `references/` 或脚本
2. `workspace_skill_list` + `workspace_skill_view` — 避免重名与重复
3. 阅读 `templates/SKILL.md.template`，按类型选章节（见下）
4. `workspace_skill_create` — 写入 `.agent/.skills/<name>/SKILL.md`
5. （可选）`workspace_skill_write_aux` — `references/*.md`
6. 运行校验（见「验证」）
7. 确认 manifest 已开 `tools.skills`（设置 → 记忆与检索 / 账户工具）

### 优化现有技能

1. `workspace_skill_view` 读全文
2. 对照「最佳实践」与 P0/P1 安全清单
3. `workspace_skill_patch` 小步修改（勿整文件覆盖除非用户明确要求）
4. 更新 frontmatter `version` 与 Changelog

### 安全审核

1. 读 `SKILL.md`、`references/`、脚本
2. 跑 `validate_skill.py`
3. 有 P0 则**禁止**建议用户启用，直至修复

---

## ClawFlow 路径与工具（必读）

| 概念 | 路径 / 工具 |
|------|-------------|
| Hermes 技能根 | `.agent/.skills/<目录名>/` |
| 主文档 | `SKILL.md`（必需，进 FTS） |
| 长文附录 | `references/*.md`、`.txt` |
| 列举 / 阅读 | `workspace_skill_list`、`workspace_skill_view` |
| 新建 | `workspace_skill_create` |
| 改主文档 | `workspace_skill_patch` |
| 写附录 | `workspace_skill_write_aux` |
| 删除 | `workspace_skill_delete`（**须用户明确确认**） |
| 检索 | `workspace_memory_search`（索引含 `.skills`） |
| 重建索引 | `workspace_memory_rebuild_index`（若可用） |

**不是本技能的目标：** Cursor 个人技能 `~/.cursor/skills/` — 仅当用户明确要求「个人技能」时再讨论，默认只操作 `.agent/.skills/`。

**目录名：** 小写、数字、连字符（`release-checklist`），避免空格与中文路径。

---

## 技能类型模板 (Skill Templates)

按需从 `templates/SKILL.md.template` 裁剪，不必保留全部章节。

### 1. 基础型 (Basic)
清单、术语表、重复工作流、评审步骤。

### 2. API / 集成型 (API)
外部 HTTP API：环境变量、端点、请求/响应示例、限流与错误码。**禁止**在 SKILL 中写死 API Key。

### 3. 工作区工具型 (Workspace Tools)
依赖 `workspace_*` 工具（读文件、patch、shell 等）：写清**相对工作区根**路径与审批边界。

### 4. 文件处理型 (File)
PDF/Excel/Office：说明输入格式、抽取方式；大段摘录放 `references/`。

### 5. 浏览器 / 自动化型 (Browser)
若项目启用相关能力：步骤化导航、等待条件、反爬注意（勿虚构不存在的浏览器工具名；抓取用 `web_scrape`）。

---

## 最佳实践 (Best Practices)

### SKILL.md 编写

✅ 推荐：
- YAML frontmatter（`name`、`description`、`version`）
- 具体触发词与用户话术示例
- 编号步骤 + 「输入 → 输出」示例
- 写清不适用场景，减少误触发

❌ 避免：
- 空泛的「帮助用户」
- 超过约 2000 行难维护（拆技能或挪 `references/`）
- 硬编码密钥、绝对路径（优先相对工作区根）

### 安全性（P0 / P1 / P2）

| 级别 | 示例 | 处理 |
|------|------|------|
| **P0** | 命令注入、路径穿越、SSRF、密钥泄露 | 必须修复 |
| **P1** | 输入未校验、错误暴露堆栈 | 强烈建议修复 |
| **P2** | 文档不全、性能可优化 | 可迭代 |

技能内嵌的 Python/Bash 脚本同样适用；创建后应用 `scripts/validate_skill.py` 做静态粗检。

### 测试

- [ ] 正常触发与主流程
- [ ] 边界：空输入、超长、特殊字符
- [ ] 错误：依赖文件不存在、工具未开启
- [ ] `workspace_memory_search` 能搜到关键词

可在技能目录增加 `_tests.md` 记录用例（可选）。

### 版本

语义化版本：`MAJOR.MINOR.PATCH`；Breaking 改 MAJOR，新增章节/步骤改 MINOR，措辞修正改 PATCH。

---

## 验证 (Validation)

在工作区根执行（路径按实际调整）：

```bash
python .agent/.skills/skill-creator/scripts/validate_skill.py .agent/.skills/<skill-name>
```

退出码 `0` 为通过；存在 P0 或结构错误时为非 0。

---

## 使用场景 (Usage Scenarios)

### 场景 A：从零创建「发布检查清单」

1. 目录名 `release-checklist`
2. 用模板写触发词：「准备发布」「上线前检查」
3. `workspace_skill_create` 写入 SKILL.md
4. 校验 + 让用户试一句触发话

### 场景 B：把对话里的 SOP 固化

1. 从对话提炼步骤 → 写入「工作流程」
2. 易变长文 → `references/checklist-detail.md` + `workspace_skill_write_aux`
3. SKILL.md 保留摘要与链接式说明（相对路径）

### 场景 C：审核他人技能

1. `workspace_skill_view`
2. `validate_skill.py` + 人工读 P0 清单
3. 输出审核报告（见下）；P0 未清则不建议启用

---

## 输出格式 (Output Format)

### 创建完成

```markdown
✅ **Hermes 技能已创建**

- **名称：** <name>
- **路径：** `.agent/.skills/<name>/`
- **版本：** 1.0.0
- **校验：** validate_skill.py → 通过 / 警告 N 条
- **下一步：** 在对话中用触发词试跑；确认 `tools.skills` 已开启
```

### 优化建议

```markdown
📝 **优化建议**（当前 1.0.0 → 建议 1.1.0）

1. 缺少「错误处理」示例
2. P1：references 中含未转义的路径说明
是否应用 patch？(yes/no)
```

---

## 与 skill-creator 包内资源

| 文件 | 用途 |
|------|------|
| `templates/SKILL.md.template` | 新技能空白骨架 |
| `examples/hello-skill/SKILL.md` | 最小示例（可复制目录名另建） |
| `scripts/validate_skill.py` | 结构 + 安全粗检 |
| `_meta.json` | 机器可读元数据 |

---

## FAQ

**Q：和 `.agent/.memory/` 有什么区别？**  
A：`.memory` 是跨会话记忆笔记；`.skills` 是可检索的**能力包**（流程、清单、领域 SOP）。

**Q：创建后搜不到？**  
A：确认 `tools.skills`、等待索引或 `workspace_memory_rebuild_index`。

**Q：能否自动创建 `default/` 示例目录？**  
A：已废弃；请用本技能 + `workspace_skill_create` 显式创建。

---

## Changelog

### [2.0.0] - 2026-05-19
- 对齐 WorkBuddy `skills-creator` 包结构（templates / examples / scripts / _meta.json）
- 补充 ClawFlow 工具表、验证命令与场景化输出
- 仅在工作区**首次初始化**（尚无 `.agent/`）时由应用写入本包

---

_可安全编辑本目录下任意文件；应用不会在打开既有工作区时自动补写或覆盖。_
