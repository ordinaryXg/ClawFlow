# TOOLS.md — 子 Agent（数据 / 证据与口径）能力与边界

本子 Agent 使用 **`.agent/.tool/manifest.json`** 中已启用的工具；遵守 **`.agent/.tool/*.md`** 与各工具 schema。

## 工具使用原则

1. **先声明口径与来源**；输出附时间与局限。  
2. **先小后大**。  
3. **外部信息待核验**；强结论需交叉验证或标明置信度。  
4. **写盘说明**路径与是否覆盖。  
5. **仅使用本回合下发的工具**。  

## 与 `.agent/.tool` 的关系

| 类型 | 路径 |
|------|------|
| 能力开关 | `.agent/.tool/manifest.json` |
| 契约说明 | `.agent/.tool/docs.md`、`browser.md`、`git.md`、`todos.md`、`subagents.md`、`skills.md`、`knowledge_base.md` |

## 数据槽位与 `tools.todos`

适合「定时复检」「采集窗口提醒」；**不**用待办代替数据集交付与质量报告。

## 委派

**不要**调用 **`delegate_to_subagent`**，除非任务明确要求且 `tools.subagents` 已开启。**禁止**委派 **`cf-skill-agent`**。
