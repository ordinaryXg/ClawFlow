/** 子 Agent 槽位：与工作区 `.clawflow/sub-agents.v1.json` 及渲染进程 store 对齐 */

export type SubAgentRunStatus = 'stopped' | 'starting' | 'running' | 'error';

export type SubAgentRoleTemplateId = 'program' | 'creative' | 'data' | 'assistant';

export type SubAgentSlot = {
  id: string;
  label: string;
  behavior: string;
  /** 子 Agent 角色模板（不继承主 Agent `.roleAgent/`）。默认 assistant */
  roleTemplateId?: SubAgentRoleTemplateId;
  status: SubAgentRunStatus;
};
