import { randomUUID } from 'crypto';
import * as fs from 'fs';
import { getGlobalClawFlowEngine, type ToolApprovalNeededPayload } from '../../engine/clawflow-engine';
import { buildSystemSubAgentRoleSystemContent } from './system-agent-role-bootstrap';
import { readSystemSubAgentSlots, writeSystemSubAgentSlots } from './system-agent-service';
import {
  systemSubclawflowSlotDirAbs,
  systemSubmemorySlotDirAbs,
} from './system-agent-layout';
import {
  COGNITIVE_ALLOCATION_AGENT_SLOT_ID,
  EXPECTATION_PLANNING_AGENT_SLOT_ID,
  SKILL_AGENT_SLOT_ID,
} from '../../shared/system-agent-constants';
import type { InteractionMode } from '../../engine/providers/types';
import type { SubAgentRunRequest, SubAgentRunResult } from './system-sub-agent-run-types';
import { writeSystemRunSnapshot } from './system-agent-run-snapshot';

const runningBySlot = new Map<string, string>();

export type SystemSubAgentRunRequest = SubAgentRunRequest;

export async function runSystemSubAgentOnce(req: SystemSubAgentRunRequest): Promise<SubAgentRunResult> {
  const runId = randomUUID();
  const ws = String(req.workspaceRoot || '').trim();
  const slotId = String(req.slotId || '').trim();
  const conversationId = String(req.conversationId || '').trim();
  const taskText = String(req.taskText || '').trim();
  if (!ws) return { ok: false, runId, error: 'missing_workspaceRoot' };
  if (!slotId) return { ok: false, runId, error: 'missing_slotId' };
  if (!conversationId) return { ok: false, runId, error: 'missing_conversationId' };
  if (!taskText) return { ok: false, runId, error: 'missing_taskText' };

  if (runningBySlot.has(slotId)) {
    return { ok: false, runId, error: 'slot_already_running' };
  }
  runningBySlot.set(slotId, runId);

  const setStatus = async (status: 'starting' | 'running' | 'stopped' | 'error') => {
    try {
      const slots = await readSystemSubAgentSlots();
      const idx = slots.findIndex((s) => s.id === slotId);
      if (idx >= 0) {
        slots[idx] = { ...slots[idx], status };
        await writeSystemSubAgentSlots(slots);
      }
    } catch {
      /* ignore */
    }
  };

  try {
    await setStatus('starting');
    try {
      await fs.promises.mkdir(systemSubclawflowSlotDirAbs(slotId), { recursive: true });
      await fs.promises.mkdir(systemSubmemorySlotDirAbs(slotId), { recursive: true });
    } catch {
      /* ignore */
    }

    const slots = await readSystemSubAgentSlots();
    const slot = slots.find((s) => s.id === slotId);
    const label = slot?.label?.trim() || slotId;
    const behavior = slot?.behavior?.trim() || '';
    const roleTemplateId = slot?.roleTemplateId ?? 'assistant';

    await setStatus('running');
    await writeSystemRunSnapshot(slotId, {
      status: 'running',
      taskText,
      conversationId,
      logTail: '',
      updatedAt: Date.now(),
    });

    const roleAgent = await buildSystemSubAgentRoleSystemContent(roleTemplateId);
    const systemPrefix = [
      roleAgent,
      '',
      '---',
      '[ClawFlow] 系统级子 Agent（不占用工作区 `.subagent/` 名册）。',
      `系统 Agent ID：${slotId}`,
      `名称：${label}`,
      `角色模板：${roleTemplateId}`,
      `系统缓存（应用数据目录，非工作区路径）：subclawflow/${slotId}/、submemory/${slotId}/`,
      `当前任务关联工作区根（只读上下文）：${ws}`,
      behavior ? `行为摘要：\n${behavior}` : '行为摘要：（空）',
      '---',
      '',
    ].join('\n');

    const userText = [systemPrefix, taskText].join('\n');

    const mode: InteractionMode =
      slotId === COGNITIVE_ALLOCATION_AGENT_SLOT_ID
        ? 'ask'
        : slotId === EXPECTATION_PLANNING_AGENT_SLOT_ID
          ? 'plan'
          : 'multitask';

    const out = await getGlobalClawFlowEngine().sendMessage({
      conversationId,
      userText,
      mode,
      ...(req.modelId ? { modelId: req.modelId } : {}),
      workspaceRoot: ws,
      onDelta: req.onDelta ? (text) => req.onDelta?.({ runId, slotId, text }) : undefined,
      assistantMessageChannel: 'assistant_tool_summary',
      assistantMessageMeta: { subAgent: { runId, slotId, label, system: true } },
      ...(req.onToolApprovalNeeded
        ? {
            onToolApprovalNeeded: (p: ToolApprovalNeededPayload) =>
              req.onToolApprovalNeeded?.({ ...p, runId, slotId }),
          }
        : {}),
    });

    const afterStatus = slotId === SKILL_AGENT_SLOT_ID ? 'running' : 'stopped';
    await setStatus(afterStatus);
    await writeSystemRunSnapshot(slotId, {
      status: 'completed',
      taskText,
      conversationId,
      logTail: String(out.message ?? '').slice(-64000),
      updatedAt: Date.now(),
    });
    return { ok: true, runId, message: out.message ?? '' };
  } catch (e: unknown) {
    await setStatus('error');
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, runId, error: msg };
  } finally {
    runningBySlot.delete(slotId);
  }
}
