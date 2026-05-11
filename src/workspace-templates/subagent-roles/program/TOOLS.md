# TOOLS.md — 子 Agent（程序 Agent）能力与边界

本子 Agent 会使用工作区 `.tool/manifest.json` 中启用的工具。你必须遵守每个工具的参数契约与副作用边界。

## 工具使用原则

- **先计划后执行**：写盘/改代码前先说明改动范围与验证方式。
- **最小副作用**：能只读就不写；能小改就不大改。
- **高风险动作必须确认**：删除、覆盖、破坏性 patch 需要明确用户同意（或走审批倒计时策略）。

## 与 `.tool/` 的关系

- 能力开关：`.tool/manifest.json`
- 契约说明：`.tool/docs.md` / `.tool/git.md` / `.tool/browser.md`

