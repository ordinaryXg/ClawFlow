import { randomUUID } from 'crypto';
import * as fs from 'fs';
import type { WebContents } from 'electron';
import { getGlobalClawFlowEngine, type ToolApprovalNeededPayload } from '../../engine/clawflow-engine';
import { buildSubAgentRoleSystemContent } from '../../engine/subagent-role-context';
import { readSubAgentSlots, writeSubAgentSlots } from './sub-agent-service';
import { writeRunSnapshot } from './sub-agent-run-snapshot';
import { broadcastSubAgentsUpdated } from './sub-agent-broadcast';
import { SKILL_AGENT_SLOT_ID } from '../../shared/skill-agent-constants';
import { isReservedSubAgentSlotId } from '../../shared/sub-agent-roster-constants';
import { subclawflowSlotDirAbs, submemorySlotDirAbs } from '../workspace/workspace-service';
import { appendWorkspaceChangeLog } from '../workspace/workspace-change-log';

export type SubAgentRunRequest = {
  workspaceRoot: string;
  slotId: string;
  taskText: string;
  /** 追加到这个会话中（当前架构为每个 workspace 单会话；仍保留该字段以便未来拆分） */
  conversationId: string;
  modelId?: string;
  /** 一次性子 Agent：完成后自动从 slots 持久化中移除（默认 false） */
  oneOff?: boolean;
  /** 可选：在 UI 路径下用于工具审批弹窗 */
  onToolApprovalNeeded?: (p: ToolApprovalNeededPayload & { runId: string; slotId: string }) => void | Promise<void>;
  /** 可选：流式 delta */
  onDelta?: (p: { runId: string; slotId: string; text: string }) => void;
};

export type SubAgentRunResult =
  | { ok: true; runId: string; message: string }
  | { ok: false; runId: string; error: string };

const runningBySlot = new Map<string, string>();

function slotKey(workspaceRoot: string, slotId: string): string {
  return `${String(workspaceRoot).replace(/\\/g, '/').toLowerCase()}::${slotId}`;
}

export async function runSubAgentOnce(req: SubAgentRunRequest): Promise<SubAgentRunResult> {
  const runId = randomUUID();
  const ws = String(req.workspaceRoot || '').trim();
  const slotId = String(req.slotId || '').trim();
  const conversationId = String(req.conversationId || '').trim();
  const taskText = String(req.taskText || '').trim();
  if (!ws) return { ok: false, runId, error: 'missing_workspaceRoot' };
  if (!slotId) return { ok: false, runId, error: 'missing_slotId' };
  if (!conversationId) return { ok: false, runId, error: 'missing_conversationId' };
  if (!taskText) return { ok: false, runId, error: 'missing_taskText' };

  const key = slotKey(ws, slotId);
  if (runningBySlot.has(key)) {
    return { ok: false, runId, error: 'slot_already_running' };
  }
  runningBySlot.set(key, runId);
  let logTail = '';
  const flushLog = (chunk: string) => {
    if (!chunk) return;
    logTail += chunk;
    if (logTail.length > 64000) logTail = logTail.slice(-64000);
  };

  const setStatus = async (status: 'starting' | 'running' | 'stopped' | 'error') => {
    try {
      const slots = await readSubAgentSlots(ws);
      const idx = slots.findIndex((s) => s.id === slotId);
      if (idx >= 0) {
        slots[idx] = { ...slots[idx], status };
        await writeSubAgentSlots(ws, slots);
        broadcastSubAgentsUpdated(ws);
      }
    } catch {
      /* ignore */
    }
  };

  try {
    await setStatus('starting');
    try {
      await fs.promises.mkdir(subclawflowSlotDirAbs(ws, slotId), { recursive: true });
      await fs.promises.mkdir(submemorySlotDirAbs(ws, slotId), { recursive: true });
    } catch {
      /* ignore */
    }
    const slots = await readSubAgentSlots(ws);
    const slot = slots.find((s) => s.id === slotId);
    const label = slot?.label?.trim() || slotId;
    const behavior = slot?.behavior?.trim() || '';
    const roleTemplateId = slot?.roleTemplateId ?? 'assistant';

    await setStatus('running');

    await writeRunSnapshot(ws, slotId, {
      status: 'running',
      taskText,
      conversationId,
      logTail: '',
      updatedAt: Date.now(),
    });

    const roleAgent = await buildSubAgentRoleSystemContent(ws, roleTemplateId);
    const systemPrefix = [
      roleAgent,
      '',
      '---',
      '[ClawFlow] 你是一个子 Agent（sub-agent）。请严格遵守工作区规则与工具边界。',
      `子 Agent ID：${slotId}`,
      `子 Agent 名称：${label}`,
      `子 Agent 角色模板：${roleTemplateId}`,
      `本子 Agent 工作缓存目录（相对工作区根，与主会话 .agent/.clawflow/ 分离）：.subagent/.subclawflow/${slotId}/`,
      `本子 Agent 记忆目录（与主 .agent/.memory/、根目录 MEMORY.md 分离）：.subagent/.submemory/${slotId}/`,
      `  - 片段/当日笔记建议路径：.subagent/.submemory/${slotId}/YYYY-MM-DD.md`,
      `  - 本子槽位长期备忘（可选）：.subagent/.submemory/${slotId}/MEMORY.md`,
      behavior ? `子 Agent 行为摘要：\n${behavior}` : '子 Agent 行为摘要：（空）',
      '---',
      '',
    ].join('\n');

    const userText = [
      systemPrefix,
      '任务：',
      taskText,
      '',
      '要求：',
      '- 输出需要可执行/可验证（如有）。',
      '- 如果需要调用工具（读写文件/Git/搜索/爬取等），请在调用前确认必要性并尽量最小化副作用。',
    ].join('\n');

    const out = await getGlobalClawFlowEngine().sendMessage({
      conversationId,
      userText,
      mode: 'multitask',
      ...(req.modelId ? { modelId: req.modelId } : {}),
      workspaceRoot: ws,
      onDelta: req.onDelta
        ? (text) => {
            flushLog(text);
            req.onDelta?.({ runId, slotId, text });
          }
        : (t) => flushLog(t),
      assistantMessageChannel: 'assistant_tool_summary',
      assistantMessageMeta: {
        subAgent: {
          runId,
          slotId,
          label,
        },
      },
      ...(req.onToolApprovalNeeded
        ? {
            onToolApprovalNeeded: (p) => req.onToolApprovalNeeded?.({ ...p, runId, slotId }),
          }
        : {}),
    });

    await setStatus(slotId === SKILL_AGENT_SLOT_ID ? 'running' : 'stopped');
    await writeRunSnapshot(ws, slotId, {
      status: 'completed',
      taskText,
      conversationId,
      logTail,
      updatedAt: Date.now(),
    });
    if (slotId !== SKILL_AGENT_SLOT_ID) {
      void appendWorkspaceChangeLog(ws, {
        kind: 'agent_dispatch',
        title: `Agent 调度：${label}`,
        conversationId,
        userPreview: `槽位 \`${slotId}\`\n\n任务：\n${taskText.slice(0, 1200)}`,
        assistantExcerpt: String(out.message ?? '').slice(0, 3500),
        meta: { slotId, runId, subAgentOk: true, oneOff: Boolean(req.oneOff) },
      }).catch(() => undefined);
    }
    if (req.oneOff && !isReservedSubAgentSlotId(slotId)) {
      try {
        const latest = await readSubAgentSlots(ws);
        const next = latest.filter((s) => s.id !== slotId);
        await writeSubAgentSlots(ws, next);
        broadcastSubAgentsUpdated(ws);
      } catch {
        /* ignore */
      }
    }
    return { ok: true, runId, message: out.message ?? '' };
  } catch (e: unknown) {
    await setStatus('error');
    try {
      const ws = String(req.workspaceRoot || '').trim();
      const slotId = String(req.slotId || '').trim();
      const taskText = String(req.taskText || '').trim();
      const conversationId = String(req.conversationId || '').trim();
      if (ws && slotId) {
        await writeRunSnapshot(ws, slotId, {
          status: 'error',
          taskText,
          conversationId,
          logTail,
          updatedAt: Date.now(),
        });
        if (slotId !== SKILL_AGENT_SLOT_ID) {
          const slotsErr = await readSubAgentSlots(ws);
          const lab = slotsErr.find((s) => s.id === slotId)?.label?.trim() || slotId;
          const msg = e instanceof Error ? e.message : String(e);
          void appendWorkspaceChangeLog(ws, {
            kind: 'agent_dispatch',
            title: `Agent 调度失败：${lab}`,
            conversationId,
            userPreview: `槽位 \`${slotId}\`\n\n任务：\n${taskText.slice(0, 1200)}`,
            assistantExcerpt: msg.slice(0, 3500),
            meta: { slotId, runId, subAgentOk: false },
          }).catch(() => undefined);
        }
      }
    } catch {
      /* ignore */
    }
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, runId, error: msg };
  } finally {
    runningBySlot.delete(key);
  }
}

export function sendSubAgentRunDelta(sender: WebContents, payload: { runId: string; slotId: string; text: string }): void {
  try {
    sender.send('subAgents:runDelta', payload);
  } catch {
    /* ignore */
  }
}

export function sendSubAgentRunFinal(
  sender: WebContents,
  payload: { runId: string; slotId: string; ok: boolean; message?: string; error?: string }
): void {
  try {
    sender.send('subAgents:runFinal', payload);
  } catch {
    /* ignore */
  }
}

