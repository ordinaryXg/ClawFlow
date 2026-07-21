import type { ToolRuntime } from '../tool-runtime-core';
import { truncateForToolLog } from '../tool-runtime-core';
import { readScheduleTriggers, writeScheduleTriggers, ensureScheduleNextFire } from '../../../main/scheduling/schedule-triggers-service';
import { rescheduleScheduleTriggersForWorkspace } from '../../../main/scheduling/schedule-triggers-scheduler';
import { broadcastScheduleTriggersUpdated } from '../../../main/scheduling/schedule-triggers-broadcast';
import { defaultScheduleTrigger, type ScheduleTriggerRecord } from '../../../shared/schedule-triggers';

export function registerSchedulingTools(rt: ToolRuntime): void {
  // --- 工作区周期调度（持久化 + 调度 + 广播）---
  rt.register(
    {
      type: 'function',
      function: {
        name: 'workspace_schedule_list',
        description:
          'List periodic schedule triggers for this workspace (persistent under workspace `.clawflow-data/`)',
        strict: true,
        parameters: {
          type: 'object',
          properties: {},
          required: [],
          additionalProperties: false,
        },
      },
    },
    async (_args, ctx) => {
      const list = await readScheduleTriggers(ctx.workspaceRoot);
      const summary = list.map((t) => ({
        id: t.id,
        title: t.title,
        enabled: t.enabled,
        status: t.status,
        nextFireAt: t.trigger.kind === 'schedule' ? t.trigger.nextFireAt : undefined,
        repeat: t.trigger.kind === 'schedule' ? t.trigger.repeat : undefined,
        submitToModel: t.action.submitToModel,
      }));
      return truncateForToolLog(JSON.stringify(summary, null, 2), 12_000);
    }
  );

  rt.register(
    {
      type: 'function',
      function: {
        name: 'workspace_schedule_create',
        description:
          'Create a periodic schedule in this workspace. repeat=once|interval|cron; for interval set intervalMinutes>0; for cron set cron.',
        strict: true,
        parameters: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'Short title' },
            actionText: { type: 'string', description: 'Body text injected when the schedule fires' },
            submitToModel: { type: 'boolean', description: 'Whether firing should submit to the model' },
            repeat: { type: 'string', description: 'once | interval | cron', enum: ['once', 'interval', 'cron'] },
            intervalMinutes: { type: 'number', description: 'For repeat=interval, minutes between fires (ignored for once)' },
            cron: { type: 'string', description: 'For repeat=cron, cron expression (min hour dom mon dow)' },
            cronTz: { type: 'string', description: 'Optional IANA timezone for cron, e.g. Asia/Shanghai' },
          },
          required: ['title', 'actionText', 'submitToModel', 'repeat'],
          additionalProperties: false,
        },
      },
    },
    async (args, ctx) => {
      const title = String(args?.title ?? '').trim();
      const actionText = String(args?.actionText ?? '');
      const submitToModel = Boolean(args?.submitToModel);
      const repeat = args?.repeat === 'interval' ? 'interval' : args?.repeat === 'cron' ? 'cron' : 'once';
      const intervalMinutes =
        typeof args?.intervalMinutes === 'number' && Number.isFinite(args.intervalMinutes) && args.intervalMinutes > 0
          ? Math.max(1, Math.floor(args.intervalMinutes))
          : undefined;
      const cron = typeof args?.cron === 'string' ? args.cron.trim() : '';
      const cronTz = typeof args?.cronTz === 'string' ? args.cronTz.trim() : '';

      let t = defaultScheduleTrigger({ title: title || undefined });
      t = {
        ...t,
        title: title || t.title,
        action: { text: actionText, submitToModel },
        updatedAt: Date.now(),
      };
      if (repeat === 'interval' && intervalMinutes) {
        t = {
          ...t,
          trigger: {
            kind: 'schedule',
            repeat: 'interval',
            intervalMinutes,
            nextFireAt: Date.now() + intervalMinutes * 60_000,
          },
          consumeOnFire: false,
        };
      }
      if (repeat === 'cron' && cron) {
        t = {
          ...t,
          trigger: {
            kind: 'schedule',
            repeat: 'cron',
            cron,
            ...(cronTz ? { cronTz } : {}),
            nextFireAt: undefined,
          },
          consumeOnFire: false,
        };
      }
      t = ensureScheduleNextFire(t);
      const list = [...(await readScheduleTriggers(ctx.workspaceRoot)), t];
      await writeScheduleTriggers(ctx.workspaceRoot, list);
      rescheduleScheduleTriggersForWorkspace(ctx.workspaceRoot);
      broadcastScheduleTriggersUpdated(ctx.workspaceRoot);
      return `OK created schedule id=${t.id}`;
    }
  );

  rt.register(
    {
      type: 'function',
      function: {
        name: 'workspace_schedule_update',
        description: 'Update an existing periodic schedule by id (title, enabled, status, action, schedule fields)',
        strict: true,
        parameters: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Schedule id' },
            title: { type: 'string', description: 'New title (optional)' },
            enabled: { type: 'boolean', description: 'Enable/disable' },
            status: { type: 'string', enum: ['pending', 'done'], description: 'Mark pending or done' },
            actionText: { type: 'string', description: 'Replace action body text' },
            submitToModel: { type: 'boolean', description: 'Replace submit-to-model flag' },
            repeat: { type: 'string', enum: ['once', 'interval', 'cron'], description: 'Schedule repeat mode' },
            intervalMinutes: { type: 'number', description: 'Interval minutes when repeat=interval' },
            cron: { type: 'string', description: 'Cron expression when repeat=cron' },
            cronTz: { type: 'string', description: 'Optional IANA timezone for cron' },
          },
          required: ['id'],
          additionalProperties: false,
        },
      },
    },
    async (args, ctx) => {
      const id = String(args?.id ?? '').trim();
      if (!id) return 'ERROR: missing id';
      const list = await readScheduleTriggers(ctx.workspaceRoot);
      const idx = list.findIndex((x) => x.id === id);
      if (idx < 0) return `ERROR: not found: ${id}`;
      let t: ScheduleTriggerRecord = { ...list[idx] };
      const now = Date.now();
      if (typeof args.title === 'string' && args.title.trim()) t = { ...t, title: args.title.trim(), updatedAt: now };
      if (typeof args.enabled === 'boolean') t = { ...t, enabled: args.enabled, updatedAt: now };
      if (args.status === 'pending' || args.status === 'done') t = { ...t, status: args.status, updatedAt: now };
      if (typeof args.actionText === 'string')
        t = { ...t, action: { ...t.action, text: args.actionText }, updatedAt: now };
      if (typeof args.submitToModel === 'boolean')
        t = { ...t, action: { ...t.action, submitToModel: args.submitToModel }, updatedAt: now };
      if ((args.repeat === 'once' || args.repeat === 'interval' || args.repeat === 'cron') && t.trigger.kind === 'schedule') {
        const tr = t.trigger;
        const nextRepeat = args.repeat;
        t = {
          ...t,
          trigger: {
            ...tr,
            repeat: nextRepeat,
            ...(nextRepeat === 'interval'
              ? { cron: undefined, cronTz: undefined }
              : nextRepeat === 'cron'
                ? { intervalMinutes: undefined }
                : { intervalMinutes: undefined, cron: undefined, cronTz: undefined }),
          },
          updatedAt: now,
        };
      }
      if (typeof args.intervalMinutes === 'number' && args.intervalMinutes > 0 && t.trigger.kind === 'schedule') {
        const tr = t.trigger;
        t = {
          ...t,
          trigger: {
            ...tr,
            intervalMinutes: Math.max(1, Math.floor(args.intervalMinutes)),
            repeat: tr.repeat === 'once' || tr.repeat === 'cron' ? 'interval' : tr.repeat,
            nextFireAt: Date.now() + Math.max(1, Math.floor(args.intervalMinutes)) * 60_000,
            cron: undefined,
            cronTz: undefined,
          },
          updatedAt: now,
        };
      }
      if (typeof args.cron === 'string' && args.cron.trim() && t.trigger.kind === 'schedule') {
        const tr = t.trigger;
        const cron = args.cron.trim();
        const cronTz = typeof args.cronTz === 'string' ? args.cronTz.trim() : '';
        t = {
          ...t,
          trigger: {
            ...tr,
            repeat: 'cron',
            cron,
            ...(cronTz ? { cronTz } : { cronTz: undefined }),
            intervalMinutes: undefined,
            nextFireAt: undefined,
          },
          consumeOnFire: false,
          updatedAt: now,
        };
      } else if (typeof args.cronTz === 'string' && t.trigger.kind === 'schedule' && t.trigger.repeat === 'cron') {
        const tr = t.trigger;
        const tz = args.cronTz.trim();
        t = {
          ...t,
          trigger: { ...tr, cronTz: tz || undefined, nextFireAt: undefined },
          updatedAt: now,
        };
      }
      t = ensureScheduleNextFire(t);
      const next = [...list];
      next[idx] = t;
      await writeScheduleTriggers(ctx.workspaceRoot, next);
      rescheduleScheduleTriggersForWorkspace(ctx.workspaceRoot);
      broadcastScheduleTriggersUpdated(ctx.workspaceRoot);
      return `OK updated schedule ${id}`;
    }
  );

  rt.register(
    {
      type: 'function',
      function: {
        name: 'workspace_schedule_remove',
        description: 'Remove a periodic schedule trigger by id from this workspace',
        strict: true,
        parameters: {
          type: 'object',
          properties: { id: { type: 'string', description: 'Schedule id' } },
          required: ['id'],
          additionalProperties: false,
        },
      },
    },
    async (args, ctx) => {
      const id = String(args?.id ?? '').trim();
      if (!id) return 'ERROR: missing id';
      const list = await readScheduleTriggers(ctx.workspaceRoot);
      const next = list.filter((x) => x.id !== id);
      if (next.length === list.length) return `ERROR: not found: ${id}`;
      await writeScheduleTriggers(ctx.workspaceRoot, next);
      rescheduleScheduleTriggersForWorkspace(ctx.workspaceRoot);
      broadcastScheduleTriggersUpdated(ctx.workspaceRoot);
      return `OK removed schedule ${id}`;
    }
  );
}
