/**
 * 待办触发器：按工作区持久化，主进程调度，渲染进程展示与编辑。
 * 与 LLM tool-runtime 无关。
 */

export const TODO_TRIGGERS_FILE_VERSION = 1 as const;

export type TodoTriggerStatus = 'pending' | 'done';

export type TodoTriggerRepeat = 'once' | 'interval';

export type TodoTriggerSchedule = {
  kind: 'schedule';
  /** 下次触发时间（epoch ms）；由保存/调度维护 */
  nextFireAt?: number;
  repeat: TodoTriggerRepeat;
  /** repeat === 'interval' 时必填（分钟） */
  intervalMinutes?: number;
};

export type TodoTriggerAction = {
  text: string;
  /** true：等价用户点击发送，走 Gateway/引擎 */
  submitToModel: boolean;
};

export type TodoTriggerRecord = {
  id: string;
  title: string;
  enabled: boolean;
  status: TodoTriggerStatus;
  createdAt: number;
  updatedAt: number;
  trigger: TodoTriggerSchedule;
  action: TodoTriggerAction;
  /** 触发一次后自动标为完成（适用于 once；interval 通常 false） */
  consumeOnFire?: boolean;
  lastFiredAt?: number;
};

export type TodoTriggersFile = {
  version: typeof TODO_TRIGGERS_FILE_VERSION;
  triggers: TodoTriggerRecord[];
};

function newTriggerId(): string {
  const c = typeof globalThis !== 'undefined' ? (globalThis as { crypto?: { randomUUID?: () => string } }).crypto : undefined;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return `t-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

export function defaultTodoTrigger(partial?: Partial<Pick<TodoTriggerRecord, 'title'>>): TodoTriggerRecord {
  const now = Date.now();
  return {
    id: newTriggerId(),
    title: partial?.title?.trim() || '待办',
    enabled: true,
    status: 'pending',
    createdAt: now,
    updatedAt: now,
    trigger: {
      kind: 'schedule',
      repeat: 'once',
      nextFireAt: now + 60_000,
    },
    action: {
      text: '',
      submitToModel: false,
    },
    consumeOnFire: true,
  };
}
