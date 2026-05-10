import { BrowserWindow } from 'electron';
import * as path from 'path';
import * as workspaceService from './workspace-service';
import { resolveWorkspaceRootForWebContents } from './electron-workspace-context';
import { readTodoTriggers, writeTodoTriggers, ensureScheduleNextFire } from './todo-triggers-service';
import type { TodoTriggerRecord } from './shared/todo-triggers';
import { stickySatellitePathByWindowId } from './sticky-satellite-windows';

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

function broadcastFire(workspaceRoot: string, t: TodoTriggerRecord): void {
  const resolved = path.resolve(workspaceRoot);
  const payload = {
    workspaceRoot: resolved,
    triggerId: t.id,
    title: t.title,
    text: t.action.text,
    submitToModel: t.action.submitToModel,
  };
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed()) continue;
    try {
      const wc = win.webContents;
      if (workspaceService.isSameWorkspacePath(resolveWorkspaceRootForWebContents(wc), resolved)) {
        wc.send('todo-trigger:fired', payload);
      }
    } catch {
      /* ignore */
    }
  }
}

async function applyPostFireMutation(workspaceRoot: string, triggerId: string): Promise<void> {
  const list = await readTodoTriggers(workspaceRoot);
  const idx = list.findIndex((x) => x.id === triggerId);
  if (idx < 0) return;
  const t = list[idx];
  const now = Date.now();
  let next: TodoTriggerRecord = {
    ...t,
    lastFiredAt: now,
    updatedAt: now,
  };

  if (t.trigger.kind === 'schedule') {
    if (t.trigger.repeat === 'once') {
      next = {
        ...next,
        status: 'done',
        enabled: false,
        trigger: { ...t.trigger, nextFireAt: undefined },
      };
    } else {
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
    }
  }

  list[idx] = next;
  await writeTodoTriggers(workspaceRoot, list);
}

async function handleFire(workspaceRoot: string, triggerId: string): Promise<void> {
  timeoutByKey.delete(timerKey(workspaceRoot, triggerId));
  const list = await readTodoTriggers(workspaceRoot);
  const t = list.find((x) => x.id === triggerId);
  if (!t || !t.enabled || t.status !== 'pending' || t.trigger.kind !== 'schedule') {
    rescheduleTodoTriggersForWorkspace(workspaceRoot);
    return;
  }
  broadcastFire(workspaceRoot, t);
  await applyPostFireMutation(workspaceRoot, triggerId);
  rescheduleTodoTriggersForWorkspace(workspaceRoot);
}

export function scheduleOneTrigger(workspaceRoot: string, t: TodoTriggerRecord): void {
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

export function rescheduleTodoTriggersForWorkspace(workspaceRoot: string): void {
  const root = path.resolve(workspaceRoot);
  clearTimersForWorkspace(root);
  void (async () => {
    const raw = await readTodoTriggers(root);
    for (const t of raw) {
      scheduleOneTrigger(root, t);
    }
  })();
}

export function rescheduleAllTodoTriggers(): void {
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
    rescheduleTodoTriggersForWorkspace(r);
  }
}
