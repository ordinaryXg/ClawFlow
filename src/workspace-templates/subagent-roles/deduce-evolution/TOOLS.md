# TOOLS.md — Deduce Evolution 能力与边界

本角色在进化管线中具备**完整工具权限**：

- 指工作区 `.agent/.tool/manifest.json` 中**已启用**的全部能力与契约（`docs`、`git`、`shell`、`web_search`、`web_scrape`、`todos`、`skills`、`knowledge_base`、Hermes 记忆等）；未开启的项引擎不会下发，勿声称已调用。
- 遵守 `.agent/.tool/*.md` 与各工具 schema。

## 工具使用原则

1. **阶段路径优先**: 仅改动当前阶段允许的路径（见 `AGENTS.md` 表格）；工具可全域读/搜，写入仍受阶段约束。
2. **先工具与技能，后自创**: 需要能力时优先调用 manifest 内工具与技能（见 `AGENTS.md`「技能与工具取舍」），确无覆盖再维护 `.agent/.skills/`。
3. **先读后写**: `workspace_skill_list` / `workspace_skill_view`、`hermes_search`、`workspace_read_file` 等再 patch 或写入。
4. **记忆阶段**: 用 `hermes_memory_upsert` / `hermes_memory_delete` / `hermes_search` 维护索引（须已开启 `tools.knowledge_base`），勿写密钥。管线触发至少需 `tools.docs` + `tools.skills`。

## 与 `.agent/.tool` 的关系

| 文件                  | 路径                               | 作用                                                                                                                                                     |
| ------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `manifest.json`     | `.agent/.tool/manifest.json`     | 创建/设置工作区时的勾选会写回此文件。`tools.docs`、`tools.git`、`tools.shell`、`tools.web_search`、`tools.web_scrape`、`tools.scheduling`、`tools.skills`、`tools.knowledge_base` 等。 |
| `docs.md`           | `.agent/.tool/docs.md`           | 文档类工具清单（与 `tools.docs` 对应）。                                                                                                                            |
| `browser.md`        | `.agent/.tool/browser.md`        | 网络搜索 / 爬取（与 `web_search`、`web_scrape` 对应）。                                                                                                             |
| `git.md`            | `.agent/.tool/git.md`            | Git 类工具说明（与 `tools.git` 对应）。                                                                                                                           |
| `shell.md`          | `.agent/.tool/shell.md`          | 工作区内命令行执行（与 `tools.shell` 对应）。                                                                                                                         |
| `scheduling.md`          | `.agent/.tool/scheduling.md`          | **周期调度**（与 `tools.scheduling` 对应）：无人格、结构化定时触发。                                                                                                          |
| `skills.md`         | `.agent/.tool/skills.md`         | Hermes 能力（与 `tools.skills` 对应）。                                                                                                                 |
| `knowledge_base.md` | `.agent/.tool/knowledge_base.md` | 知识库检索（与 `tools.knowledge_base` 对应）。                                                                                                                    |


## 委派
- **不要**调用 `delegate_to_subagent`。