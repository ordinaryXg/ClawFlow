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

const PHASE_ORDER: EvolutionAspectKey[] = ['memory', 'skills', 'role_doc'];

const PHASE_TITLE: Record<EvolutionAspectKey, string> = {
  memory: '记忆整理',
  skills: '技能维护',
  role_doc: '角色同步',
};

export function evolutionToolsGate(tools: WorkspaceToolSelection): boolean {
  return Boolean(tools.skills && tools.docs);
}

export function buildEvolutionPhaseTask(
  aspect: EvolutionAspectKey,
  ctx: { chatExcerpt: string; memoryExcerpt: string }
): string {
  const chat = ctx.chatExcerpt.trim() || '（自上次进化以来的主对话摘录不可用。）';
  const mem = ctx.memoryExcerpt.trim() || '（.agent/.memory 下暂无可读 Markdown 或目录为空。）';
  const shared = [
    '【主工作区进化 — 单阶段任务】',
    `当前阶段：**${PHASE_TITLE[aspect]}**（仅完成本阶段目标，勿越界改其它目录）。`,
    '',
    '### 对话摘录（上下文）',
    '---',
    chat,
    '---',
    '',
    '### 记忆库摘录（.agent/.memory）',
    '---',
    mem,
    '---',
    '',
  ];

  switch (aspect) {
    case 'memory':
      return [
        ...shared,
        '## 本阶段：记忆整理',
        '合并对话与既有 `.agent/.memory/` 内容，剔除冗余流水账，将可长期复用的结论、偏好、约束写入 `.agent/.memory/`（可更新/新建 `.md`；勿写密钥）。',
        '收尾：3 条以内要点说明变更了哪些文件。',
      ].join('\n');
    case 'skills':
      return [
        ...shared,
        '## 本阶段：技能维护',
        '在 `.agent/.skills/` 下基于近期主题创建或**最小改动**更新 Hermes 技能（`SKILL.md` + 必要时 `references/`）；遵守工作区工具与白名单；优先小步、可回滚。',
        '收尾：3 条以内要点说明新建/更新了哪些技能目录。',
      ].join('\n');
    case 'role_doc':
      return [
        ...shared,
        '## 本阶段：角色同步',
        '根据当前记忆与技能现状，**扩写**（勿整文件覆盖）以下文件：',
        '- `.agent/.roleAgent/AGENTS.md`',
        '- `.agent/.roleAgent/SOUL.md`',
        '收尾：3 条以内要点说明角色文档变更摘要。',
      ].join('\n');
    default:
      return shared.join('\n');
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
}): Promise<EvolutionPipelineResult> {
  const root = String(params.workspaceRoot ?? '').trim();
  const runId = evolutionRunId();
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

  for (const aspect of PHASE_ORDER) {
    releaseSystemSubAgentSlot(SKILL_AGENT_SLOT_ID);
    const taskText = buildEvolutionPhaseTask(aspect, ctx);

    const runPromise = runSystemSubAgentOnce({
      workspaceRoot: root,
      slotId: SKILL_AGENT_SLOT_ID,
      taskText,
      conversationId: SKILL_AUDIT_EPHEMERAL_CONVERSATION_ID,
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

    if (!res.ok) {
      return fail('phase_agent_failed', String(res.error ?? 'run_failed'));
    }
    if (res.ok && res.message.trim()) {
      messages.push(`### ${PHASE_TITLE[aspect]}\n${res.message.trim().slice(0, 1500)}`);
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
