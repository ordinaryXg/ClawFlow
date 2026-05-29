import * as fs from 'fs';
import * as path from 'path';
import { CronExpressionParser } from 'cron-parser';
import {
  SCHEDULE_TRIGGERS_FILE_VERSION,
  type ScheduleTriggerRecord,
  type ScheduleTriggersFile,
} from '../../shared/schedule-triggers';
import * as workspaceService from '../workspace/workspace-service';

function isRecord(x: unknown): x is ScheduleTriggerRecord {
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

async function readTriggersFromFile(fp: string): Promise<ScheduleTriggerRecord[]> {
  try {
    const buf = await fs.promises.readFile(fp, 'utf-8');
    const parsed = JSON.parse(buf) as unknown;
    if (parsed && typeof parsed === 'object') {
      const triggers = (parsed as ScheduleTriggersFile).triggers;
      if (Array.isArray(triggers)) {
        return triggers.filter(isRecord);
      }
    }
  } catch {
    /* missing or invalid */
  }
  return [];
}

export async function readScheduleTriggers(workspaceRoot: string): Promise<ScheduleTriggerRecord[]> {
  const fp = workspaceService.scheduleTriggersStorePath(path.resolve(workspaceRoot));
  return readTriggersFromFile(fp);
}

export async function writeScheduleTriggers(
  workspaceRoot: string,
  triggers: ScheduleTriggerRecord[]
): Promise<void> {
  const root = path.resolve(workspaceRoot);
  const body: ScheduleTriggersFile = { version: SCHEDULE_TRIGGERS_FILE_VERSION, triggers };
  const fp = workspaceService.scheduleTriggersStorePath(root);
  await fs.promises.mkdir(path.dirname(fp), { recursive: true });
  await fs.promises.writeFile(fp, JSON.stringify(body, null, 2), 'utf-8');
}

/** 确保 pending + enabled 的 schedule 有合理的 nextFireAt */
export function ensureScheduleNextFire(t: ScheduleTriggerRecord, now = Date.now()): ScheduleTriggerRecord {
  if (t.status === 'done' || !t.enabled || t.trigger.kind !== 'schedule') return t;
  const tr = t.trigger;
  let next = tr.nextFireAt;
  const resolveCronNext = (): number | null => {
    const expr = String(tr.cron ?? '').trim();
    if (!expr) return null;
    try {
      const it = CronExpressionParser.parse(expr, {
        currentDate: new Date(now + 1000),
        ...(tr.cronTz && String(tr.cronTz).trim() ? { tz: String(tr.cronTz).trim() } : {}),
      });
      const d = it.next().toDate();
      const ms = d.getTime();
      return Number.isFinite(ms) ? ms : null;
    } catch {
      return null;
    }
  };

  if (tr.repeat === 'cron') {
    const cronNext = resolveCronNext();
    next = cronNext ?? undefined;
    if (next == null) next = now + 60_000;
  } else if (next == null || !Number.isFinite(next)) {
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
