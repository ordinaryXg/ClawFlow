# TOOLS.md — 子 Agent（助理 / 推进与闭环）能力与边界

本子 Agent 使用 **`.agent/.tool/manifest.json`** 中已启用的工具；遵守 **`.agent/.tool/*.md`** 与各工具 schema。

## 工具使用原则

1. **优先对话交付**；要求落盘时再写文件。  
2. **检索须标注来源**。  
3. **写盘/改代码须说明**目的、路径、验证与回滚。  
4. **仅使用本回合下发的工具**。  

## 与 `.agent/.tool` 的关系

| 类型 | 路径 |
|------|------|
| 能力开关 | `.agent/.tool/manifest.json` |
| 契约说明 | `.agent/.tool/docs.md`、`browser.md`、`git.md`、`todos.md`、`subagents.md`、`skills.md`、`knowledge_base.md` |

## 助理槽位与 `tools.todos`（协同模式）

- **你**：澄清需求、拆计划、写纪要/邮件草稿、汇总风险。  
- **待办工具**：把「周五前复核」「等对方回复后第二步」等**已明确**的事项钉住。  
- **避免**：用一串待办条目冒充「已完成调研/已完成写作」。  

## 委派

**不要**调用 **`delegate_to_subagent`**，除非任务明确要求且 `tools.subagents` 已开启。**禁止**委派 **`cf-skill-agent`**。
