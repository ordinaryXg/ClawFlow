/**
 * 待办触发器：按工作区持久化，主进程调度，渲染进程展示与编辑。
 * 与 LLM tool-runtime 无关。
 */

export const TODO_TRIGGERS_FILE_VERSION = 1 as const;

export type TodoTriggerStatus = 'pending' | 'done';

export type TodoTriggerRepeat = 'once' | 'interval' | 'cron';

export type TodoTriggerSchedule = {
  kind: 'schedule';
  /** 下次触发时间（epoch ms）；由保存/调度维护 */
  nextFireAt?: number;
  repeat: TodoTriggerRepeat;
  /** repeat === 'interval' 时必填（分钟） */
  intervalMinutes?: number;
  /**
   * repeat === 'cron' 时必填：cron 表达式（默认 5 段：min hour dom mon dow）。
   * 由调度器计算 nextFireAt；UI 可展示但不建议手改 nextFireAt。
   */
  cron?: string;
  /** 可选：IANA 时区名（如 "Asia/Shanghai"）；缺省使用本机时区 */
  cronTz?: string;
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
  /** 最近一次触发写入会话的正文快照（调度侧记录） */
  lastFireDeliveredText?: string;
  /** 最近一次触发时是否已请求模型跟进 */
  lastFireSubmitToModel?: boolean;
  /** 最近一次触发后经模型生成的助手回复正文（用户可见「回执」） */
  lastFireAiReceipt?: string;
};

export type TodoTriggersFile = {
  version: typeof TODO_TRIGGERS_FILE_VERSION;
  triggers: TodoTriggerRecord[];
};

/**
 * 侧栏等摘要：计入「未执行」(仅一次) + 「固定执行」(按间隔) 且仍未完成的待办；
 * `status === 'done'` 视为已归档/已完成，不计入。
 */
export function isTodoTriggerCountedInWorkspaceHub(t: TodoTriggerRecord): boolean {
  if (t.status !== 'pending') return false;
  if (t.trigger.kind !== 'schedule') return false;
  return t.trigger.repeat === 'once' || t.trigger.repeat === 'interval' || t.trigger.repeat === 'cron';
}

export function countTodoTriggersForWorkspaceHub(triggers: TodoTriggerRecord[]): number {
  return triggers.reduce((n, t) => n + (isTodoTriggerCountedInWorkspaceHub(t) ? 1 : 0), 0);
}

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
