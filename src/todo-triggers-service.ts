import * as fs from 'fs';
import * as path from 'path';
import {
  TODO_TRIGGERS_FILE_VERSION,
  type TodoTriggerRecord,
  type TodoTriggersFile,
} from './shared/todo-triggers';
import * as workspaceService from './workspace-service';

function isRecord(x: unknown): x is TodoTriggerRecord {
  if (!x || typeof x !== 'object') return false;
  const o = x as Record<string, unknown>;
  if (typeof o.id !== 'string' || typeof o.title !== 'string' || typeof o.enabled !== 'boolean') return false;
  if (o.status !== 'pending' && o.status !== 'done') return false;
  if (typeof o.createdAt !== 'number' || typeof o.updatedAt !== 'number') return false;
  const trig = o.trigger;
  if (!trig || typeof trig !== 'object') return false;
  if ((trig as { kind?: string }).kind !== 'schedule') return false;
  const act = o.action;
  if (!act || typeof act !== 'object') return false;
  if (typeof (act as { text?: string }).text !== 'string') return false;
  if (typeof (act as { submitToModel?: boolean }).submitToModel !== 'boolean') return false;
  return true;
}

export async function readTodoTriggers(workspaceRoot: string): Promise<TodoTriggerRecord[]> {
  const root = path.resolve(workspaceRoot);
  const fp = workspaceService.todoTriggersStorePath(root);
  try {
    const buf = await fs.promises.readFile(fp, 'utf-8');
    const parsed = JSON.parse(buf) as unknown;
    if (parsed && typeof parsed === 'object') {
      const triggers = (parsed as TodoTriggersFile).triggers;
      if (Array.isArray(triggers)) {
        return triggers.filter(isRecord);
      }
    }
  } catch {
    /* missing */
  }
  return [];
}

export async function writeTodoTriggers(workspaceRoot: string, triggers: TodoTriggerRecord[]): Promise<void> {
  const root = path.resolve(workspaceRoot);
  const dir = workspaceService.clawflowDir(root);
  await fs.promises.mkdir(dir, { recursive: true });
  const body: TodoTriggersFile = { version: TODO_TRIGGERS_FILE_VERSION, triggers };
  const fp = workspaceService.todoTriggersStorePath(root);
  await fs.promises.writeFile(fp, JSON.stringify(body, null, 2), 'utf-8');
}

/** 确保 pending + enabled 的 schedule 有合理的 nextFireAt */
export function ensureScheduleNextFire(t: TodoTriggerRecord, now = Date.now()): TodoTriggerRecord {
  if (t.status === 'done' || !t.enabled || t.trigger.kind !== 'schedule') return t;
  const tr = t.trigger;
  let next = tr.nextFireAt;
  if (next == null || !Number.isFinite(next)) {
    if (tr.repeat === 'interval' && tr.intervalMinutes && tr.intervalMinutes > 0) {
      next = now + tr.intervalMinutes * 60_000;
    } else {
      next = now + 60_000;
    }
  }
  if (next < now) next = now;
  return {
    ...t,
    trigger: { ...tr, nextFireAt: next },
  };
}
