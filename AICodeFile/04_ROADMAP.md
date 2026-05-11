# ClawFlow 路线图（以当前落地功能为起点）

> 本文只写“要达成什么 + 验收标准 + 依赖”，实现细节与文件定位写在 `06_TASKS.md` 与 `02_ARCHITECTURE.md`。

## 现状快照（已落地）

- Workspace：初始化与最近列表；`.tool/manifest.json` 能力开关（v2）
- 工具治理：schema 过滤 + 执行二次校验（防止禁用工具被调用）
- 爬取：`web_scrape` 工具 + 记录/工件落盘 + UI 查看
- 待办：UI + IPC + 调度；阶段 3 新增模型工具 `workspace_todo_*`
- 子 Agent：slots 元数据 + IPC + Hub 展示；阶段 3 新增模型工具 `workspace_subagent_*`
- 技能：**OpenClaw 技能市场已移除**；`/skills` 与 Hub 为占位，方向为 Hermes 式自主进化型 Skills（应用内管线，未落地）
- 知识库：manifest 键与 `workspace_knowledge_query` 仅占位

## M1：阶段 3 收尾（工具可编排闭环稳定）

- **目标**
  - 待办与子 Agent slots：写盘/广播/UI 刷新一致，异常路径可恢复
  - 文档与代码一致（AICodeFile 全面重整理）
- **验收标准**
  - 待办：模型工具创建/更新/删除后，UI 计数与列表刷新；调度能触发并写入回执字段
  - 子 Agent：模型工具 upsert/remove 后，Hub 刷新可见
  - `.tool/*.md` 与 manifest 能力一致（至少“缺失补写”正确）

## M2：自主进化型 Skills（替代原 OpenClaw 技能清单方案）

- **目标**
  - 定义应用内 Skills 数据模型与生命周期（发现、版本、启用/禁用），参考 Hermes 式「自主进化」产品形态
  - 明确运行时注入路径：动态 tools 注入 / 仅上下文注入 / 混合；权限边界与（未来）manifest 开关
- **验收标准**
  - 有清晰的 Skills 策略文档（含代码落点、缓存、失败降级），且与「无 OpenClaw 技能市场」现状一致
  - 对话主链路不依赖 OpenClaw CLI `skills` 子命令；连接器如需 OpenClaw 仅在 Connectors 功能域内说明

## M3：知识库（RAG）最小可用

- **目标**
  - 定义数据模型（向量/路径/元数据）与索引构建流程
  - 实现 Retriever 工具（替换 `workspace_knowledge_query` stub）
- **验收标准**
  - 可以对工作区内指定目录/文件建立索引
  - `workspace_knowledge_query` 能返回可引用的证据片段（路径 + 行范围/摘要）

## M4：真实子 Agent 委派（可选，后置）

- **目标**
  - 在 slots 之上实现最小的“委派执行”能力（例如 `delegate_to_subagent` 类工具）
- **验收标准**
  - 至少支持 1 个子 Agent 的并行/隔离执行与结果回传
  - 有清晰的资源隔离与取消/超时策略

