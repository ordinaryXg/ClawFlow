/** 子 Agent 槽位：与工作区 `.clawflow/sub-agents.v1.json` 及渲染进程 store 对齐 */

export type SubAgentRunStatus = 'stopped' | 'starting' | 'running' | 'error';

export type SubAgentSlot = {
  id: string;
  label: string;
  behavior: string;
  status: SubAgentRunStatus;
};
