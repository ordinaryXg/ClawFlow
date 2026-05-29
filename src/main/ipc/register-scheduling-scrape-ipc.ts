/**
 * 周期调度 / 抓取 IPC：须在 app.whenReady 之前注册，避免渲染进程过早 invoke。
 */
import { ipcMain } from 'electron';
import * as fs from 'fs';
import * as workspaceExplorer from '../workspace/workspace-explorer';
import { readScrapeJobs } from '../scrape/scrape-service';
import { readScheduleTriggers, writeScheduleTriggers } from '../scheduling/schedule-triggers-service';
import { broadcastScheduleTriggersUpdated } from '../scheduling/schedule-triggers-broadcast';
import { rescheduleScheduleTriggersForWorkspace } from '../scheduling/schedule-triggers-scheduler';
import * as workspaceChangeLog from '../workspace/workspace-change-log';
import {
  requireWorkspaceRootForWebContents,
  resolveWorkspaceRootForWebContents,
} from '../electron-workspace-context';
import type { ScheduleTriggerRecord } from '../../shared/schedule-triggers';

export function registerScheduleTriggersIPC(): void {
  for (const ch of ['scheduleTriggers:list', 'scheduleTriggers:saveAll', 'scheduleTriggers:setAiReceipt'] as const) {
    try {
      ipcMain.removeHandler(ch);
    } catch {
      /* first load */
    }
  }

  ipcMain.handle('scheduleTriggers:list', async (event) => {
    const root = resolveWorkspaceRootForWebContents(event.sender);
    if (!root) return { triggers: [] };
    const triggers = await readScheduleTriggers(root);
    return { triggers };
  });

  ipcMain.handle('scheduleTriggers:saveAll', async (event, triggers: unknown) => {
    const root = requireWorkspaceRootForWebContents(event.sender);
    if (!Array.isArray(triggers)) return { ok: false as const, error: 'invalid_payload' };
    const incoming = triggers as ScheduleTriggerRecord[];
    const disk = await readScheduleTriggers(root);
    const diskById = new Map(disk.map((x) => [x.id, x]));
    const merged = incoming.map((inc) => {
      const ex = diskById.get(inc.id);
      return ex?.status === 'done' ? ex : inc;
    });
    await writeScheduleTriggers(root, merged);
    rescheduleScheduleTriggersForWorkspace(root);
    broadcastScheduleTriggersUpdated(root);
    const diskIds = new Set(disk.map((x) => x.id));
    for (const t of merged) {
      if (!diskIds.has(t.id)) {
        const trig = t.trigger;
        const rep = trig.kind === 'schedule' ? trig.repeat : '';
        void workspaceChangeLog
          .appendWorkspaceChangeLog(root, {
            kind: 'schedule_added',
            title: `周期调度新增：${(t.title || '未命名').slice(0, 80)}`,
            userPreview: `ID：${t.id}\n标题：${t.title}\n计划：${rep}${
              rep === 'interval' && trig.kind === 'schedule' ? ` / 间隔 ${trig.intervalMinutes ?? '?'} 分钟` : ''
            }${rep === 'cron' && trig.kind === 'schedule' ? ` / cron：${trig.cron ?? ''}` : ''}`,
            assistantExcerpt: `执行文案：\n${String(t.action?.text ?? '').slice(0, 1500)}\n提交模型：${t.action?.submitToModel ? '是' : '否'}`,
            meta: { triggerId: t.id },
          })
          .catch(() => undefined);
      }
    }
    return { ok: true as const };
  });

  ipcMain.handle('scheduleTriggers:setAiReceipt', async (event, payload: unknown) => {
    const root = resolveWorkspaceRootForWebContents(event.sender);
    if (!root) return { ok: false as const, error: 'no_workspace' };
    if (!payload || typeof payload !== 'object') return { ok: false as const, error: 'invalid_payload' };
    const o = payload as Record<string, unknown>;
    const triggerId = typeof o.triggerId === 'string' ? o.triggerId.trim() : '';
    const receiptText = typeof o.receiptText === 'string' ? o.receiptText : '';
    if (!triggerId) return { ok: false as const, error: 'missing_trigger' };
    const list = await readScheduleTriggers(root);
    const idx = list.findIndex((x) => x.id === triggerId);
    if (idx < 0) return { ok: false as const, error: 'not_found' };
    const now = Date.now();
    list[idx] = { ...list[idx], lastFireAiReceipt: receiptText, updatedAt: now };
    await writeScheduleTriggers(root, list);
    broadcastScheduleTriggersUpdated(root);
    return { ok: true as const };
  });
}

export function registerScrapeIPC(): void {
  for (const ch of ['scrape:listJobs', 'scrape:readArtifact'] as const) {
    try {
      ipcMain.removeHandler(ch);
    } catch {
      /* first load */
    }
  }

  ipcMain.handle('scrape:listJobs', async (event) => {
    const root = resolveWorkspaceRootForWebContents(event.sender);
    if (!root) return { jobs: [] };
    const jobs = await readScrapeJobs(root);
    return { jobs };
  });

  ipcMain.handle('scrape:readArtifact', async (event, payload: unknown) => {
    const root = resolveWorkspaceRootForWebContents(event.sender);
    if (!root) return { ok: false as const, error: 'no_workspace' };
    const jobId =
      payload && typeof payload === 'object' && typeof (payload as { jobId?: unknown }).jobId === 'string'
        ? String((payload as { jobId: string }).jobId).trim()
        : '';
    if (!jobId) return { ok: false as const, error: 'missing_job' };
    const jobs = await readScrapeJobs(root);
    const job = jobs.find((j) => j.id === jobId);
    if (!job?.artifactRelPath || job.status !== 'ok') return { ok: false as const, error: 'no_artifact' };
    try {
      const full = workspaceExplorer.resolvePathInsideWorkspace(root, job.artifactRelPath);
      const text = await fs.promises.readFile(full, 'utf-8');
      return { ok: true as const, text };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return { ok: false as const, error: msg };
    }
  });
}
