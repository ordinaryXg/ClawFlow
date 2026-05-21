# 工作区技能（Skills）

## 是什么

技能位于 **`.agent/.skills/<目录名>/`**（`SKILL.md` + 可选 `references/`）。

- **`tools.skills` 开启时**，system 每轮注入【工作区技能名册】（来自 `skillManifest.json`：名称 / 简介 / 关键字 / `skillRootRel`）。**以名册发现技能，勿调列举工具。**
- **无 invoke 工具**：匹配名册 → `workspace_skill_view` 读 `{skillRootRel}/SKILL.md` → 按正文执行。
- **新建/审核技能**：先 view `.agent/.skills/skill-creator/SKILL.md`，再按元技能流程（其内会用 create/patch 等）。
- 跨技能检索 → `hermes_search`（`tools.knowledge_base`），命中后再 view。

> 开关：`.agent/.tool/manifest.json` → `tools.skills`

## 边界

**能做**：读名册（已在 system）、view 正文、patch / write_aux / delete；create 仅 skill-creator 流程内。

**勿**：为「有哪些技能」调工具；跳过 skill-creator 直接 create；用 `workspace_write_file` 写 SKILL.md；只看摘要就声称已按技能执行；未回读就声称已写入。

写入走 **`skills_guard`**；成功后下轮名册自动更新。

## 工具与参数

| 工具 | 要点 |
|------|------|
| `workspace_skill_view` | `path`，如 `.agent/.skills/foo/SKILL.md` |
| `workspace_skill_create` | 仅 skill-creator 内；`skill_name`；已存在则失败 |
| `workspace_skill_patch` | `relativePath`、`oldText`、`newText`、`replaceAll` |
| `workspace_skill_write_aux` | 仅 `references/*.md\|*.txt` |
| `workspace_skill_delete` | `skill_name` + `confirm: true` |

## 该怎么用

1. **用技能**：名册匹配 → view `SKILL.md` → 按正文调其它工具。
2. **新建**：view skill-creator → 按元技能 create/patch → view 验证。
3. **改/删**：先 view → patch 或 write_aux；删除须用户确认 + `confirm: true`。
4. **写后**：view 或贴关键片段作证据。

## 工具清单（受 `tools.skills` 关断）

{{TOOLS:skills}}
