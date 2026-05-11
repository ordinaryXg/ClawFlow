import { create } from 'zustand';

/** 多 Agent 并行扩展：占位状态，后续可接引擎/进程实际状态 */
export type SubAgentRunStatus = 'stopped' | 'starting' | 'running' | 'error';

export interface SubAgentSlot {
  id: string;
  label: string;
  /** 行为说明（提示词职责摘要等） */
  behavior: string;
  status: SubAgentRunStatus;
}

interface SubAgentState {
  slots: SubAgentSlot[];
}

/**
 * 当前为 UI 占位：展示「启用中的子 Agent」列表结构。
 * 后续可将 slots 与工作区 IPC、任务调度对齐。
 */
export const useSubAgentStore = create<SubAgentState>(() => ({
  slots: [],
}));
