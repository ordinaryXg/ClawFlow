# Git 操作能力（git）

## 是什么

用于在当前工作区内执行受控的 Git 操作（只读/对比/日志等）。具体可用命令以工具清单为准。

> 开关：`.agent/.tool/manifest.json` → `tools.git`

## 有什么用

- 查看当前改动（status/diff）
- 回溯提交历史（log）
- 辅助生成可评审的变更说明与提交信息

## 该怎么用

- 先 `workspace_git_status` 确认改动范围
- 再 `workspace_git_diff` 查看细节（必要时 staged/unstaged）
- 用 `workspace_git_log` 对齐仓库提交风格

## 什么时候用

- 你要提交/推送前
- 你需要解释“改了什么/为什么改”
- 你需要定位某段代码何时引入

下列工具受 `tools.git` 关断：

{{TOOLS:git}}


提示：提交/推送属于高影响操作，通常需要用户明确指示或审批通过。
