/** 无磁盘技能时「技能」面板右侧展示的说明（引导使用内置 skill-creator，不再自动创建 default/） */
export const DEFAULT_SKILL_TEMPLATE_MARKDOWN = `# 尚未发现工作区技能

ClawFlow **不会**再自动创建 \`.agent/.skills/default/\` 示例目录。

## 如何开始

1. 确认 \`.agent/.tool/manifest.json\` 中已开启 **\`tools.skills\`**。
2. 打开工作区后若已自动补全，请阅读 **\`.agent/.skills/skill-creator/SKILL.md\`**（「创建 Skill 的 Skill」），在对话中让模型按其中流程使用 \`workspace_skill_create\` 等工具新建你的第一个技能目录。
3. 若该文件不存在，可在对话中说明「按 skill-creator 初始化 Hermes 技能」或手动从应用模板复制同名目录。

## 常用工具

- \`workspace_skill_list\` / \`workspace_skill_view\`：浏览已有技能  
- \`workspace_skill_create\`：新建 \`.agent/.skills/<名称>/SKILL.md\`  
- \`workspace_skill_patch\` / \`workspace_skill_write_aux\`：小步修改正文与 \`references/\`

---

*新建技能请统一走 skill-creator 约定，避免依赖已废弃的 default 自动目录。*`;
