/** 子 Agent 槽位：与工作区 `.agent/.clawflow/sub-agents.v1.json` 及渲染进程 store 对齐 */

export type SubAgentRunStatus = 'stopped' | 'starting' | 'running' | 'error';

export type SubAgentRoleTemplateId =
  | 'program'
  | 'creative'
  | 'data'
  | 'assistant'
  | 'deduce-evolution'
  | 'cognitive-allocation'
  | 'expectation-planning';

export type SubAgentSlot = {
  id: string;
  label: string;
  behavior: string;
  /** 子 Agent 角色模板（不继承主 Agent `.agent/.roleAgent/`）。默认 assistant */
  roleTemplateId?: SubAgentRoleTemplateId;
  status: SubAgentRunStatus;
  /**
   * 是否允许被主 Agent 委派调度（工作区委派已移除）。系统 Skill Agent 为 false。
   * 缺省视为 true（兼容旧数据）。
   */
  delegatable?: boolean;
  /**
   * 仅 Skill Agent 槽位（`cf-skill-agent`）：工作区 manifest 是否启用 `tools.skills`。
   * 供 UI 区分「系统监控中」与「技能能力未开启」。
   */
  skillToolsEnabled?: boolean;
};

/** 子 Agent 最近一次手动运行（或异常中断）的快照，来自 `.agent/.clawflow/sub-agent-runs.v1.json` */
export type SubAgentRunSnapshotStatus = 'idle' | 'running' | 'completed' | 'error' | 'interrupted';

export type SubAgentRunSnapshot = {
  status: SubAgentRunSnapshotStatus;
  taskText: string;
  conversationId: string;
  logTail: string;
  updatedAt: number;
};
