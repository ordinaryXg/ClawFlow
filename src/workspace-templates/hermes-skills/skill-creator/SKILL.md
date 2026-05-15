# skill-creator — 在工作区内新建 Hermes 技能

本技能由 ClawFlow **在工作区初始化时若缺失则自动补写**（路径：`.agent/.skills/skill-creator/SKILL.md`）。指导主 Agent 或用户在 **当前工作区** 下按 Hermes 约定创建、拆分或迭代其它技能目录。

## 何时使用

- 用户要求「加一个技能 / 写个 SKILL / 固化某条工作流」且目标在 **本仓库工作区** 的 `.agent/.skills/` 下。
- 需要把对话里反复出现的步骤、检查清单、术语表落成可检索、可小步修改的技能包。

## 路径与结构（ClawFlow Hermes）

- **根目录**：`.agent/.skills/<技能目录名>/`
- **必需**：同目录下 **`SKILL.md`**（主说明，会被 FTS 索引）
- **可选**：`references/` 下放补充 `.md` / `.txt`（同样可被索引；大段引用材料放这里，保持 `SKILL.md` 精炼）

**目录名建议**：小写字母、数字、连字符（如 `release-checklist`），避免空格与中文路径，便于工具与列表展示。

## 推荐流程（先读后写）

1. **列举 / 预览**：`workspace_skill_list`，对相近技能用 `workspace_skill_view` 读全文，避免重复造轮子。
2. **新建骨架**：`workspace_skill_create` 在 `.agent/.skills/<新名>/` 下创建目录并写入初版 `SKILL.md`（一次性创建；后续迭代用 patch）。
3. **小步修改正文**：`workspace_skill_patch` 只改 `SKILL.md` 的局部片段（可回滚、易审 diff）。
4. **补充长文**：`workspace_skill_write_aux` 在 `references/` 下新增或覆盖辅助 `.md` / `.txt`。
5. **检索**：`workspace_memory_search` 在已索引技能中搜关键词；若刚批量写入后列表异常，可按工作区约定调用 `workspace_memory_rebuild_index`（若工具可用）。

## SKILL.md 正文怎么写（有效技能）

建议包含以下块（按实际需要取舍，不必机械照抄标题）：

1. **一句话定位**：这个技能解决什么问题。
2. **触发条件**：什么用户话头、什么场景下应优先打开本技能（方便模型与人类检索）。
3. **步骤或检查清单**：编号步骤、命令、文件路径（相对工作区根）、注意事项。
4. **禁止与安全**：不写密钥与令牌；不暗示绕过审批的高危操作；删除技能用 `workspace_skill_delete` 前必须取得用户明确确认。
5. **示例**：一段「输入 → 期望输出」或「错误 → 纠正」的简短示例。

描述要**具体**：写清「做什么」和「何时用」，避免空泛的「帮助用户」。

## 与 Cursor 个人技能的区别

| 类型 | 位置 | 用途 |
|------|------|------|
| **本工作区 Hermes 技能** | `.agent/.skills/<name>/SKILL.md` | 随仓库/工作区走，ClawFlow 工具读写 |
| Cursor 个人技能 | 用户本机 `~/.cursor/skills/` 等 | 由 Cursor 加载，**不是**本文件要创建的目标 |

当用户明确要「工作区技能」时，只在 `.agent/.skills/` 下操作。

## 收尾

创建或大改后，用一两句话总结：新技能目录名、主要触发场景、是否需要用户在 manifest 中已开启 `tools.skills`。

---

*可安全编辑本文件；若删除，下次打开本工作区（执行工作区初始化）且文件仍缺失时，会再次自动补写。*
