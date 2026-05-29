# 周期调度（scheduling）

## 是什么

工作区**定时/周期触发器**：到点把 `actionText` 写入会话；可选 `submitToModel: true` 当作用户消息继续跑模型。

- **纯调度**：不替你执行读文件、写代码、跑命令；只负责登记时间表 + 触发文本。
- 数据落在 **`.clawflow-data/schedule-triggers.v1.json`**（工作区根；与 `.agent/` 分离）。
- 主进程调度；创建/改删后 `workspace_schedule_list` 可核验。

> 开关：`.agent/.tool/manifest.json` → `tools.scheduling`

## 边界

**能做**：list / create / update / remove 触发器；改标题、指令、启用、状态、周期。

**勿**：把模糊大任务塞进 `actionText`（到点原样注入，不会澄清）；用周期调度替代即时执行；未 list 回执就声称已创建/已删。

`actionText` 须**短、可执行、可验收**（一句话能说清做什么、怎么算完成）。

## 工具与参数

| 工具 | 要点 |
|------|------|
| `workspace_schedule_list` | 无参；返回 id、title、enabled、status、nextFireAt、repeat、submitToModel |
| `workspace_schedule_create` | 必填 `title`、`actionText`、`submitToModel`、`repeat`（`once` \| `interval` \| `cron`）；`interval` 需 `intervalMinutes`；`cron` 需 `cron`，可选 `cronTz`（如 `Asia/Shanghai`） |
| `workspace_schedule_update` | 必填 `id`；其余字段同 create，按需传 |
| `workspace_schedule_remove` | 必填 `id` |

**触发模式**

| `repeat` | 行为 |
|----------|------|
| `once` | 默认约 **1 分钟后**触发一次，随后 `status=done`、停用 |
| `interval` | 每 `intervalMinutes` 分钟触发；下次从触发时刻起算 |
| `cron` | 5 段表达式（`min hour dom mon dow`）；由调度器算 `nextFireAt` |

**定点时刻**：工具**未暴露** `nextFireAt`；需指定日期/时刻时用 **`cron` + `cronTz`**，勿假设 `once` 能设任意未来时间。

**`submitToModel`**：`true` = 触发后自动提交给模型；`false` = 仅写入会话作提醒/记录。

## 该怎么用

1. **创建前**：用户意图已能写成一条短指令；选 `repeat` 与是否自动续跑。
2. **创建后**：`workspace_schedule_list` 核对 id、`nextFireAt`。
3. **改/停/删**：`update`（`enabled: false` 或 `status: done`）或 `remove`；改周期用 `repeat` + 对应字段。
4. **举例**：每日 10:00 检查 → `repeat: cron`，`cron: "0 10 * * *"`，`cronTz: "Asia/Shanghai"`。

## 工具清单（受 `tools.scheduling` 关断）

{{TOOLS:scheduling}}
