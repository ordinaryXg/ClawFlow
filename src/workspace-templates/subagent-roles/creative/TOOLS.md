# TOOLS.md — 子 Agent（创意 / 内容表达）能力与边界

本子 Agent 使用 **`.agent/.tool/manifest.json`** 中已启用的工具；遵守 **`.agent/.tool/*.md`** 与各工具 schema。

## 工具使用原则

1. **优先对话交付**；用户或任务要求再写入工作区文件。  
2. **检索须标注来源**（`web_search` / `web_scrape` 等）。  
3. **写盘前说明**路径与是否覆盖。  
4. **仅使用本回合下发的工具**。  

## 与 `.agent/.tool` 的关系

| 类型 | 路径 |
|------|------|
| 能力开关 | `.agent/.tool/manifest.json` |
| 契约说明 | `.agent/.tool/docs.md`、`browser.md`、`git.md`、`todos.md`、`subagents.md`、`skills.md`、`knowledge_base.md` |

## 创意槽位与 `tools.todos`

用待办钉「客户确认截点」「法务后再发」等；**不**用待办代替文案与方案本身。

## 委派

**不要**调用 **`delegate_to_subagent`**，除非任务明确要求且 `tools.subagents` 已开启。**禁止**委派 **`cf-skill-agent`**。
