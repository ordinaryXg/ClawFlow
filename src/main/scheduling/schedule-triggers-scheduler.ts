import { BrowserWindow } from 'electron';
import * as path from 'path';
import * as workspaceService from '../workspace/workspace-service';
import { broadcastToWorkspaceWindows } from '../broadcast/workspace-window-broadcast';
import { readScheduleTriggers, writeScheduleTriggers, ensureScheduleNextFire } from './schedule-triggers-service';
import type { ScheduleTriggerRecord } from '../../shared/schedule-triggers';
import { stickySatellitePathByWindowId } from '../sticky-satellite-windows';
import { appendWorkspaceChangeLog } from '../workspace/workspace-change-log';

const timeoutByKey = new Map<string, NodeJS.Timeout>();

function timerKey(workspaceRoot: string, triggerId: string): string {
  return `${path.resolve(workspaceRoot)}::${triggerId}`;
}

function clearTimersForWorkspace(workspaceRoot: string): void {
  const prefix = `${path.resolve(workspaceRoot)}::`;
  for (const k of [...timeoutByKey.keys()]) {
    if (k.startsWith(prefix)) {
      const to = timeoutByKey.get(k);
      if (to) clearTimeout(to);
      timeoutByKey.delete(k);
    }
  }
}

function broadcastFire(workspaceRoot: string, t: ScheduleTriggerRecord): void {
  const resolved = path.resolve(workspaceRoot);
  const payload = {
    workspaceRoot: resolved,
    triggerId: t.id,
    title: t.title,
    text: t.action.text,
    submitToModel: t.action.submitToModel,
  };
  broadcastToWorkspaceWindows(resolved, 'schedule-trigger:fired', payload);
}

async function applyPostFireMutation(workspaceRoot: string, triggerId: string): Promise<void> {
  const list = await readScheduleTriggers(workspaceRoot);
  const idx = list.findIndex((x) => x.id === triggerId);
  if (idx < 0) return;
  const t = list[idx];
  const now = Date.now();
  const fireSnapshot = String(t.action?.text ?? '');
  const fireSubmit = Boolean(t.action?.submitToModel);
  let next: ScheduleTriggerRecord = {
    ...t,
    lastFiredAt: now,
    updatedAt: now,
    lastFireDeliveredText: fireSnapshot,
    lastFireSubmitToModel: fireSubmit,
  };

  if (t.trigger.kind === 'schedule') {
    if (t.trigger.repeat === 'once') {
      next = {
        ...next,
        status: 'done',
        enabled: false,
        trigger: { ...t.trigger, nextFireAt: undefined },
      };
    } else if (t.trigger.repeat === 'interval') {
      const mins = t.trigger.intervalMinutes && t.trigger.intervalMinutes > 0 ? t.trigger.intervalMinutes : 60;
      next = {
        ...next,
        trigger: {
          ...t.trigger,
          nextFireAt: now + mins * 60_000,
        },
      };
      if (next.consumeOnFire) {
        next = {
          ...next,
          status: 'done',
          enabled: false,
          trigger: { ...next.trigger, nextFireAt: undefined },
        };
      }
    } else {
      next = ensureScheduleNextFire({ ...next, trigger: { ...t.trigger, nextFireAt: undefined } }, now);
      if (next.consumeOnFire) {
        next = {
          ...next,
          status: 'done',
          enabled: false,
          trigger: { ...next.trigger, nextFireAt: undefined },
        };
      }
    }
  }

  list[idx] = next;
  await writeScheduleTriggers(workspaceRoot, list);
}

async function handleFire(workspaceRoot: string, triggerId: string): Promise<void> {
  timeoutByKey.delete(timerKey(workspaceRoot, triggerId));
  const list = await readScheduleTriggers(workspaceRoot);
  const t = list.find((x) => x.id === triggerId);
  if (!t || !t.enabled || t.status !== 'pending' || t.trigger.kind !== 'schedule') {
    rescheduleScheduleTriggersForWorkspace(workspaceRoot);
    return;
  }
  await applyPostFireMutation(workspaceRoot, triggerId);
  broadcastFire(workspaceRoot, t);
  const repeat = t.trigger.kind === 'schedule' ? t.trigger.repeat : '';
  void appendWorkspaceChangeLog(workspaceRoot, {
    kind: 'schedule_triggered',
    title: `周期调度触发：${(t.title || '未命名').slice(0, 80)}`,
    userPreview: `触发器 ID：${t.id}\n计划：${repeat}\n\n送达正文：\n${String(t.action?.text ?? '').slice(0, 1200)}`,
    assistantExcerpt: `提交模型跟进：${t.action.submitToModel ? '是' : '否'}`,
    meta: { triggerId: t.id, title: t.title },
  }).catch(() => undefined);
  rescheduleScheduleTriggersForWorkspace(workspaceRoot);
}

export function scheduleOneTrigger(workspaceRoot: string, t: ScheduleTriggerRecord): void {
  if (!t.enabled || t.status !== 'pending' || t.trigger.kind !== 'schedule') return;
  const prepared = ensureScheduleNextFire(t);
  const tr = prepared.trigger;
  if (tr.kind !== 'schedule' || tr.nextFireAt == null) return;
  const ms = Math.max(0, tr.nextFireAt - Date.now());
  const k = timerKey(workspaceRoot, t.id);
  const existing = timeoutByKey.get(k);
  if (existing) clearTimeout(existing);
  const to = setTimeout(() => {
    void handleFire(workspaceRoot, t.id);
  }, ms);
  timeoutByKey.set(k, to);
}

export function rescheduleScheduleTriggersForWorkspace(workspaceRoot: string): void {
  const root = path.resolve(workspaceRoot);
  clearTimersForWorkspace(root);
  void (async () => {
    const raw = await readScheduleTriggers(root);
    for (const t of raw) {
      scheduleOneTrigger(root, t);
    }
  })();
}

export function rescheduleAllScheduleTriggers(): void {
  for (const [k, to] of [...timeoutByKey.entries()]) {
    clearTimeout(to);
    timeoutByKey.delete(k);
  }
  const reg = workspaceService.loadRegistry();
  const roots = new Set<string>();
  if (reg.activeWorkspacePath) roots.add(path.resolve(reg.activeWorkspacePath));
  for (const p of reg.recentWorkspacePaths ?? []) {
    if (p) roots.add(path.resolve(p));
  }
  for (const p of stickySatellitePathByWindowId.values()) {
    roots.add(path.resolve(p));
  }
  for (const r of roots) {
    rescheduleScheduleTriggersForWorkspace(r);
  }
}
