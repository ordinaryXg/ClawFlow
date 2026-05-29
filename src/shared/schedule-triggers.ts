/**
 * 周期调度触发器：按工作区持久化，主进程调度，渲染进程展示与编辑。
 */

export const SCHEDULE_TRIGGERS_FILE_VERSION = 1 as const;

export type ScheduleTriggerStatus = 'pending' | 'done';

export type ScheduleTriggerRepeat = 'once' | 'interval' | 'cron';

export type ScheduleTriggerSchedule = {
  kind: 'schedule';
  nextFireAt?: number;
  repeat: ScheduleTriggerRepeat;
  intervalMinutes?: number;
  cron?: string;
  cronTz?: string;
};

export type ScheduleTriggerAction = {
  text: string;
  submitToModel: boolean;
};

export type ScheduleTriggerRecord = {
  id: string;
  title: string;
  enabled: boolean;
  status: ScheduleTriggerStatus;
  createdAt: number;
  updatedAt: number;
  trigger: ScheduleTriggerSchedule;
  action: ScheduleTriggerAction;
  consumeOnFire?: boolean;
  lastFiredAt?: number;
  lastFireDeliveredText?: string;
  lastFireSubmitToModel?: boolean;
  lastFireAiReceipt?: string;
};

export type ScheduleTriggersFile = {
  version: typeof SCHEDULE_TRIGGERS_FILE_VERSION;
  triggers: ScheduleTriggerRecord[];
};

export function isScheduleTriggerCountedInWorkspaceHub(t: ScheduleTriggerRecord): boolean {
  if (t.status !== 'pending') return false;
  if (t.trigger.kind !== 'schedule') return false;
  return t.trigger.repeat === 'once' || t.trigger.repeat === 'interval' || t.trigger.repeat === 'cron';
}

export function countScheduleTriggersForWorkspaceHub(triggers: ScheduleTriggerRecord[]): number {
  return triggers.reduce((n, t) => n + (isScheduleTriggerCountedInWorkspaceHub(t) ? 1 : 0), 0);
}

function newTriggerId(): string {
  const c = typeof globalThis !== 'undefined' ? (globalThis as { crypto?: { randomUUID?: () => string } }).crypto : undefined;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return `t-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

export function defaultScheduleTrigger(
  partial?: Partial<Pick<ScheduleTriggerRecord, 'title'>>
): ScheduleTriggerRecord {
  const now = Date.now();
  return {
    id: newTriggerId(),
    title: partial?.title?.trim() || '周期调度',
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
