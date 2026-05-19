# TOOLS.md — Skill Agent（技能进化 / Hermes）能力与边界

Skill Agent 依赖 **`.agent/.tool/manifest.json`** 中 **`skills`**（及 **`knowledge_base`** 等，以实际为准）；遵守 **`.agent/.tool/skills.md`** 与各工具 schema。

## 工具使用原则

1. **只动技能树**：默认限于 **`.agent/.skills/`**（以工具描述为准）。  
2. **先读后写**：`workspace_skill_list` / `workspace_skill_read` 再 `patch` 或写入。  
3. **检索辅助**：`workspace_knowledge_query`、`workspace_memory_search`（若启用）用于查漏，不替代 `SKILL.md` 落盘。  
4. **仅使用本回合下发的工具**。  

## 与 `.agent/.tool` 的关系

| 类型 | 路径 |
|------|------|
| 能力开关 | `.agent/.tool/manifest.json` |
| 技能契约 | `.agent/.tool/skills.md` |
| 其它契约 | `.agent/.tool/docs.md`、`browser.md`、`git.md`、`shell.md`、`todos.md`、`subagents.md`、`knowledge_base.md` |

## Skill 槽位与 `tools.todos`

仅适合「定期技能巡检」类提醒；**日常补丁与审计**不得依赖待办代替执行。

## 委派

**不要**调用 **`delegate_to_subagent`**。
