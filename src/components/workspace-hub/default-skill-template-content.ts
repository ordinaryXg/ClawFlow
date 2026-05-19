/** 无磁盘技能时「技能」面板右侧展示的说明（引导使用内置 skill-creator，不再自动创建 default/） */
export const DEFAULT_SKILL_TEMPLATE_MARKDOWN = `# 尚未发现工作区技能

ClawFlow **不会**再自动创建 \`.agent/.skills/default/\` 示例目录。

## 如何开始

1. 确认 \`.agent/.tool/manifest.json\` 中已开启 **\`tools.skills\`**。
2. **新建工作区**时会自动写入 **\`.agent/.skills/skill-creator/\`** v2 包；请阅读其中 \`SKILL.md\`，在对话中用 \`workspace_skill_create\` 等工具新建技能。
3. 既有工作区若无该目录，可从应用模板复制 \`skill-creator\` 或让助手按元技能说明手动创建。

## 常用工具

- \`workspace_skill_list\` / \`workspace_skill_view\`：浏览已有技能  
- \`workspace_skill_create\`：新建 \`.agent/.skills/<名称>/SKILL.md\`  
- \`workspace_skill_patch\` / \`workspace_skill_write_aux\`：小步修改正文与 \`references/\`

---

*新建技能请统一走 skill-creator 约定，避免依赖已废弃的 default 自动目录。*`;
