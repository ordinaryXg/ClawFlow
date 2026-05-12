/** 无磁盘技能时「技能」面板右侧展示的 Hermes 示例正文（与仓库内 default/SKILL.md 语义一致） */
export const DEFAULT_SKILL_TEMPLATE_MARKDOWN = `# default — 工作区默认技能（Hermes 模板）

本技能由 ClawFlow 在工作区**首次初始化且尚无其它技能**时自动创建，便于你立刻在「技能」面板看到示例目录结构，并作为后续「自主进化」的起点。

## 是什么

- **路径**：\`.agent/.skills/default/SKILL.md\`（主说明）
- **扩展**：可在同目录下 \`references/\` 放 \`.md\` / \`.txt\` 补充材料（会被 FTS 索引）

## 该怎么用

1. 在 \`.agent/.tool/manifest.json\` 中打开 **\`tools.skills\`**（以及需要全文检索时再打开 **\`tools.knowledge_base\`**）。
2. 在对话里让模型使用 \`workspace_skill_list\` / \`workspace_skill_view\` 按需读取；用 \`workspace_skill_patch\` 做小步修改；用 \`workspace_skill_create\` 新建其它技能目录。
3. 用 \`workspace_memory_search\` 在已索引的 \`SKILL.md\` 与 \`references\` 中检索关键词；若索引异常可调用 \`workspace_memory_rebuild_index\`。

## 你可以怎么改这份模板

- 把上文改成你项目里**真实可复用的约定**（命名规范、常用命令、禁止事项、检查清单等）。
- 需要删整棵技能树时再用 \`workspace_skill_delete\`（高危，通常需确认/审批）。

---

*此文件可安全编辑或删除；删除后若目录下无任何 **/SKILL.md**，下次工作区初始化会再次补回本默认技能。*`;
