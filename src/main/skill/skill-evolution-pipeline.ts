/**
 * 一次触发、三阶段顺序执行（记忆整理 → 技能维护 → 角色同步），以磁盘 diff 验收成功。
 */

import type { WorkspaceToolSelection } from '../../shared/workspace-tools';
import {
  SKILL_AGENT_SLOT_ID,
  SKILL_AUDIT_EPHEMERAL_CONVERSATION_ID,
} from '../../shared/skill-agent-constants';
import { releaseSystemSubAgentSlot, runSystemSubAgentOnce } from '../system-agents/system-sub-agent-runner';
import type { EvolutionAspectKey } from './skill-evolution-scheduler';
import {
  backupEvolutionWorkspace,
  diffEvolutionSnapshots,
  evolutionDiffHasChanges,
  evolutionRunId,
  formatEvolutionDiffLines,
  restoreEvolutionBackup,
  snapshotEvolutionWorkspace,
  type EvolutionDiffEntry,
} from './skill-evolution-snapshot';
import { appendEvolutionRun, type EvolutionRunPhaseRecord, type EvolutionRunRecord } from './skill-evolution-runs';
import { broadcastWorkspaceFilesUpdated } from '../workspace/workspace-files-broadcast';
import {
  createEvolutionChatBridge,
  pickEvolutionPhaseDisplayText,
  type EvolutionChatBridge,
} from './skill-evolution-chat';

const PHASE_ORDER: EvolutionAspectKey[] = ['memory', 'skills', 'role_doc'];

const PHASE_TITLE: Record<EvolutionAspectKey, string> = {
  memory: '记忆整理',
  skills: '技能维护',
  role_doc: '角色同步',
};

export function evolutionToolsGate(tools: WorkspaceToolSelection): boolean {
  return Boolean(tools.skills && tools.docs);
}

/** 按阶段裁剪上下文，避免三阶段重复塞满 8k+6k 摘录 */
export function buildEvolutionPhaseContext(
  aspect: EvolutionAspectKey,
  ctx: { chatExcerpt: string; memoryExcerpt: string }
): { chatExcerpt: string; memoryExcerpt: string } {
  const chat = ctx.chatExcerpt.trim();
  const mem = ctx.memoryExcerpt.trim();
  if (aspect === 'memory') {
    return { chatExcerpt: chat.slice(0, 3500), memoryExcerpt: mem.slice(0, 6500) };
  }
  if (aspect === 'skills') {
    return { chatExcerpt: chat.slice(0, 5000), memoryExcerpt: mem.slice(0, 2000) };
  }
  return { chatExcerpt: chat.slice(0, 5500), memoryExcerpt: mem.slice(0, 1500) };
}

export function buildEvolutionPhaseTask(
  aspect: EvolutionAspectKey,
  ctx: { chatExcerpt: string; memoryExcerpt: string }
): string {
  const scoped = buildEvolutionPhaseContext(aspect, ctx);
  const chat = scoped.chatExcerpt.trim() || '（自上次进化以来的主对话摘录不可用。）';
  const mem = scoped.memoryExcerpt.trim() || '（Hermes 记忆索引中暂无条目。）';
  const shared = [
    '【主工作区进化 — 单阶段任务】',
    `当前阶段：**${PHASE_TITLE[aspect]}**（仅完成本阶段目标，勿越界改其它目录）。`,
    '',
    '### 对话摘录（上下文）',
    '---',
    chat,
    '---',
    '',
  ];
  const memoryBlock =
    aspect === 'memory' || mem.length > 80
      ? ['### 记忆库摘录（Hermes 索引 · `.agent/.hermes/memory/*`）', '---', mem, '---', '']
      : [];
  const header = [...shared, ...memoryBlock];

  switch (aspect) {
    case 'memory':
      return [
        ...header,
        '## 本阶段：记忆整理',
        '基于上方「记忆库摘录」与对话，用 **`hermes_memory_upsert` / `hermes_memory_delete`** 与 **`hermes_search`** 在 Hermes 索引中整理记忆（逻辑路径 `.agent/.hermes/memory/*.md`）；勿写密钥。',
        '收尾：3 条以内要点说明新增/更新/删除了哪些记忆路径（非磁盘文件）。',
      ].join('\n');
    case 'skills':
      return [
        ...header,
        '## 本阶段：技能维护',
        '在 `.agent/.skills/` 下基于近期主题创建或**最小改动**更新 Hermes 技能（`SKILL.md` + 必要时 `references/`）；遵守工作区工具与白名单；优先小步、可回滚。',
        '收尾：3 条以内要点说明新建/更新了哪些技能目录。',
      ].join('\n');
    case 'role_doc':
      return [
        ...header,
        '## 本阶段：角色同步',
        '根据当前记忆与技能现状，**扩写**（勿整文件覆盖）以下文件：',
        '- `.agent/.roleAgent/AGENTS.md`',
        '- `.agent/.roleAgent/SOUL.md`',
        '收尾：3 条以内要点说明角色文档变更摘要。',
      ].join('\n');
    default:
      return header.join('\n');
  }
}

export type EvolutionPipelineResult =
  | {
      ok: true;
      runId: string;
      aggregateDiff: EvolutionDiffEntry[];
      phases: EvolutionRunPhaseRecord[];
      combinedMessage: string;
    }
  | {
      ok: false;
      runId: string;
      error: string;
      failureReason: string;
      phases: EvolutionRunPhaseRecord[];
      aggregateDiff: EvolutionDiffEntry[];
    };

export async function runEvolutionPipeline(params: {
  workspaceRoot: string;
  triggerTotal?: number;
  spacing?: number;
  manual?: boolean;
  chatExcerpt: string;
  memoryExcerpt: string;
  timeoutMs?: number;
  /** 写入该主会话 id 的进化卡片（实时流式） */
  mainConversationId?: string;
}): Promise<EvolutionPipelineResult> {
  const root = String(params.workspaceRoot ?? '').trim();
  const runId = evolutionRunId();
  const evolutionChat: EvolutionChatBridge | undefined = params.mainConversationId?.trim()
    ? createEvolutionChatBridge(root, params.mainConversationId.trim(), runId, Boolean(params.manual))
    : undefined;
  const phases: EvolutionRunPhaseRecord[] = [];
  const ctx = { chatExcerpt: params.chatExcerpt, memoryExcerpt: params.memoryExcerpt };
  const timeoutMs = params.timeoutMs ?? 20 * 60 * 1000;

  let initialSnap = await snapshotEvolutionWorkspace(root);
  try {
    await backupEvolutionWorkspace(root, runId);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      runId,
      error: msg,
      failureReason: 'backup_failed',
      phases,
      aggregateDiff: [],
    };
  }

  const fail = async (
    failureReason: string,
    error: string,
    aggregateDiffOverride?: EvolutionDiffEntry[]
  ): Promise<EvolutionPipelineResult> => {
    const aggregateDiff =
      aggregateDiffOverride ??
      diffEvolutionSnapshots(initialSnap, await snapshotEvolutionWorkspace(root));
    try {
      await restoreEvolutionBackup(root, runId);
      broadcastWorkspaceFilesUpdated(root);
    } catch (e) {
      console.warn('[evolution] restore after failure failed:', e);
    }
    const record: EvolutionRunRecord = {
      runId,
      at: Date.now(),
      ok: false,
      manual: params.manual,
      triggerTotal: params.triggerTotal,
      spacing: params.spacing,
      failureReason,
      phases,
      aggregateDiff,
    };
    await appendEvolutionRun(root, record).catch(() => undefined);
    return { ok: false, runId, error, failureReason, phases, aggregateDiff };
  };

  let phaseBefore = initialSnap;
  const messages: string[] = [];

  if (evolutionChat) {
    await evolutionChat.dispatchStart();
  }

  for (const aspect of PHASE_ORDER) {
    releaseSystemSubAgentSlot(SKILL_AGENT_SLOT_ID);
    const taskText = buildEvolutionPhaseTask(aspect, ctx);

    if (evolutionChat) {
      await evolutionChat.phaseStart(aspect);
    }

    let streamAcc = '';
    const runPromise = runSystemSubAgentOnce({
      workspaceRoot: root,
      slotId: SKILL_AGENT_SLOT_ID,
      taskText,
      conversationId: SKILL_AUDIT_EPHEMERAL_CONVERSATION_ID,
      onDelta: evolutionChat
        ? ({ text }) => {
            streamAcc += String(text ?? '');
            const snap = streamAcc.length > 24_000 ? streamAcc.slice(-24_000) : streamAcc;
            void evolutionChat?.phaseStream(aspect, snap);
          }
        : undefined,
    });

    let res: Awaited<ReturnType<typeof runSystemSubAgentOnce>>;
    try {
      res = await Promise.race([
        runPromise,
        new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('evolution_timeout')), timeoutMs);
        }),
      ]);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (evolutionChat) {
        await evolutionChat.phaseEnd(
          aspect,
          pickEvolutionPhaseDisplayText(streamAcc, msg),
          false
        );
      }
      phases.push({
        aspect,
        agentOk: false,
        agentError: msg,
        diff: [],
      });
      return fail(msg === 'evolution_timeout' ? 'evolution_timeout' : 'phase_exception', msg);
    } finally {
      releaseSystemSubAgentSlot(SKILL_AGENT_SLOT_ID);
    }

    const phaseAfter = await snapshotEvolutionWorkspace(root);
    const phaseDiff = diffEvolutionSnapshots(phaseBefore, phaseAfter);
    phaseBefore = phaseAfter;

    phases.push({
      aspect,
      agentOk: res.ok,
      agentError: res.ok ? undefined : String(res.error ?? 'run_failed'),
      messageExcerpt: (res.ok ? res.message : '').slice(0, 2000),
      diff: phaseDiff,
    });

    if (phaseDiff.length > 0) {
      broadcastWorkspaceFilesUpdated(root);
    }

    if (!res.ok) {
      if (evolutionChat) {
        const errText = String(res.error ?? 'run_failed');
        await evolutionChat.phaseEnd(
          aspect,
          pickEvolutionPhaseDisplayText(streamAcc, errText),
          false
        );
      }
      return fail('phase_agent_failed', String(res.error ?? 'run_failed'));
    }
    const excerpt = (res.ok ? res.message : '').trim().slice(0, 2000);
    if (excerpt) {
      messages.push(`### ${PHASE_TITLE[aspect]}\n${excerpt}`);
    }
    if (evolutionChat) {
      await evolutionChat.phaseEnd(
        aspect,
        pickEvolutionPhaseDisplayText(streamAcc, excerpt),
        res.ok
      );
    }
  }

  const finalSnap = await snapshotEvolutionWorkspace(root);
  const aggregateDiff = diffEvolutionSnapshots(initialSnap, finalSnap);

  if (!evolutionDiffHasChanges(aggregateDiff)) {
    return fail(
      'no_disk_diff',
      '进化三阶段已完成，但工作区相关路径无磁盘变更（未通过 diff 验收）',
      aggregateDiff
    );
  }

  const record: EvolutionRunRecord = {
    runId,
    at: Date.now(),
    ok: true,
    manual: params.manual,
    triggerTotal: params.triggerTotal,
    spacing: params.spacing,
    phases,
    aggregateDiff,
  };
  await appendEvolutionRun(root, record).catch(() => undefined);
  broadcastWorkspaceFilesUpdated(root);

  return {
    ok: true,
    runId,
    aggregateDiff,
    phases,
    combinedMessage: messages.join('\n\n').slice(0, 12_000),
  };
}

export function formatPipelineDiffSummary(result: EvolutionPipelineResult): string {
  const diff = result.ok ? result.aggregateDiff : result.aggregateDiff;
  return formatEvolutionDiffLines(diff, 48);
}
