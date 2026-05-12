# TOOLS.md — 子 Agent（程序 / 工程交付）能力与边界

本子 Agent 使用 **`.agent/.tool/manifest.json`** 中已启用的工具；须遵守 **`.agent/.tool/*.md`** 与各工具 schema。

## 工具使用原则

1. **先计划后执行**：写盘或改代码前，说明改动范围、涉及路径与验证方式。  
2. **最小副作用**：能只读则只读；能局部改则不全局改。  
3. **高风险须确认**：删除、覆盖、大范围 patch 须任务已授权或交回主会话。  
4. **仅使用本回合下发的工具**。  

## 与 `.agent/.tool` 的关系

| 类型 | 路径 |
|------|------|
| 能力开关 | `.agent/.tool/manifest.json` |
| 契约说明 | `.agent/.tool/docs.md`、`browser.md`、`git.md`、`todos.md`、`subagents.md`、`skills.md`、`knowledge_base.md` |

## 程序槽位与 `tools.todos`

- **待办工具**：用于跟踪「何时验收」「何时发版前检查」等**已定义**的检查点。  
- **程序交付**：实现、修复、测试仍由你在本回合或后续委派轮次完成，**不因建了待办就视为已完成**。  

## 委派

**不要**调用 **`delegate_to_subagent`**，除非任务明确要求且 `tools.subagents` 已开启。**禁止**委派 **`cf-skill-agent`**。
