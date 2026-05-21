# 命令行执行能力（shell）

## 是什么

在工作区根目录（或其子目录）内，通过系统 shell 执行一条命令，并返回合并后的 stdout/stderr。

> 开关：`.agent/.tool/manifest.json` → `tools.shell`

## 有什么用

- 运行构建、测试、包管理器、脚本等需要真实终端输出的任务
- 在模型无法仅靠读文件完成时，用命令结果作为证据（例如 `npm test`、`python -m pytest`）

## 该怎么用

- 使用 **`workspace_run_shell`**，传入：
  - `command`：完整命令行（由平台 shell 解释，Windows 为 cmd，Unix 为 sh）
  - `cwdRelative`：相对工作区根的工作目录（空字符串表示工作区根；目录须已存在）
  - `timeoutMs`（可选）：超时毫秒，默认 60000，上限 120000
- **优先专用工具**：Git 用 `workspace_git_*`，全文搜索用 `workspace_rg_search`，TypeScript 检查用 `workspace_run_tsc_no_emit`（均在 `tools.docs` / `tools.git` 下）。
- **先小后大**：先跑只读/短命令确认环境，再跑长任务。
- **输出会截断**：过长 stdout/stderr 会截断并标注，需要完整日志时请让用户本地复现。

## 什么时候用

- 用户明确要求运行命令、安装依赖、执行测试或构建
- 需要以退出码/终端输出验证某步是否成功

## 安全与审批

- 命令 **cwd 必须落在工作区内**；不能把工作目录指到工作区外。
- 在 Plan/Multitask 下，本工具属于 **高风险**：默认需用户审批后才会执行（与删除文件等等级类似）。
- 未经用户同意不要执行破坏性命令（批量删除、强制推送、格式化磁盘等）。

下列工具受 `tools.shell` 关断：

{{TOOLS:shell}}


相关（受其它开关约束）：`docs.md` 中的 `workspace_rg_search`、`workspace_run_tsc_no_emit`；`git.md` 中的 Git 只读命令。
