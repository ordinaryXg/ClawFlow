/**
 * 主对话满足「用户手动或通讯端（飞书等）」完整轮次阈值后，触发 Skill Agent（进化）三阶段管线。
 */

import * as fs from 'fs';
import * as path from 'path';
import type { StoredMessage } from '../../engine/session/session-store';
import { SessionStore } from '../../engine/session/session-store';
import { readWorkspaceToolManifest } from '../workspace/workspace-service';
import { applySuccessfulEvolutionRewards, readSkillEvolutionState, writeSkillEvolutionState } from './skill-evolution-state';
import { releaseSystemSubAgentSlot } from '../system-agents/system-sub-agent-runner';
import { SKILL_AGENT_SLOT_ID, computeSkillEvolutionSpacing } from '../../shared/skill-agent-constants';
import { buildHermesMemoryExcerpt } from '../../engine/hermes/hermes-memory-store';
import { appendWorkspaceChangeLog } from '../workspace/workspace-change-log';
import {
  evolutionToolsGate,
  formatPipelineDiffSummary,
  runEvolutionPipeline,
} from './skill-evolution-pipeline';
import { formatEvolutionDiffLines } from './skill-evolution-snapshot';
import { appendEvolutionChatMessages } from './skill-evolution-chat';

export type EvolutionAspectKey = 'memory' | 'skills' | 'role_doc';

/** 从进化 Agent 最终输出中粗分类涉及的工作区维度（用于变更记录标题与 meta）。 */
export function classifyEvolutionOutcomeMarkdown(text: string): {
  aspectKeys: EvolutionAspectKey[];
  titleZh: string;
} {
  const sample = text.slice(0, 24_000);
  const keys = new Set<EvolutionAspectKey>();
  if (
    /[\\/]\.agent[\\/]\.hermes[\\/]\.memory|记忆库|记忆瘦身|hermes_memory/i.test(
      sample
    )
  ) {
    keys.add('memory');
  }
  if (/[\\/]\.agent[\\/]\.skills|Hermes|SKILL\.md|技能/i.test(sample)) keys.add('skills');
  if (/AGENTS\.md|SOUL\.md|角色文档|[\\/]\.roleAgent[\\/]/i.test(sample)) keys.add('role_doc');
  const order: EvolutionAspectKey[] = ['memory', 'skills', 'role_doc'];
  const aspectKeys = order.filter((k) => keys.has(k));
  const label: Record<EvolutionAspectKey, string> = {
    memory: '记忆整理',
    skills: '技能维护',
    role_doc: '角色同步',
  };
  const titleZh =
    aspectKeys.length > 0 ? `进化完成 · ${aspectKeys.map((k) => label[k]).join('、')}` : '进化完成 · 综合更新';
  return { aspectKeys, titleZh };
}

const EVOLUTION_COUNTED_USER_CHANNELS = new Set<string>(['user_manual', 'user_feishu']);

export function isEvolutionCountedUserMessage(m: StoredMessage): boolean {
  if (m.role !== 'user') return false;
  const ch = m.channel;
  if (!ch) return false;
  return EVOLUTION_COUNTED_USER_CHANNELS.has(ch);
}

export function lastRoundCountsTowardEvolution(messages: StoredMessage[]): boolean {
  if (messages.length < 2) return false;
  const last = messages[messages.length - 1];
  if (last.role !== 'assistant') return false;
  if (last.channel === 'assistant_tool_summary' || last.channel === 'assistant_evolution') return false;
  for (let i = messages.length - 2; i >= 0; i--) {
    const m = messages[i];
    if (m.role === 'tool') continue;
    if (m.role === 'assistant') continue;
    if (m.role === 'user') return isEvolutionCountedUserMessage(m);
    return false;
  }
  return false;
}

async function excerptMainConversationSinceLastEvolution(
  workspaceRoot: string,
  mainConversationId: string,
  sinceMs: number | undefined,
  maxChars: number
): Promise<string> {
  try {
    const store = new SessionStore(workspaceRoot);
    const convs = await store.readAll();
    const c = convs.find((x) => x.id === mainConversationId);
    const msgs = (c?.messages ?? []).filter((m) => m && (m.role === 'user' || m.role === 'assistant')) as StoredMessage[];
    const filtered =
      typeof sinceMs === 'number' && Number.isFinite(sinceMs) && sinceMs > 0
        ? msgs.filter((m) => typeof m.timestamp === 'number' && m.timestamp > sinceMs)
        : msgs.slice(-48);
    const tail = filtered.length ? filtered.slice(-80) : msgs.slice(-48);
    const lines: string[] = [];
    let n = 0;
    for (const m of tail) {
      const role = m.role === 'user' ? 'User' : 'Assistant';
      const chunk = `[${role}] ${String(m.content ?? '').slice(0, 900)}`;
      if (n + chunk.length > maxChars) break;
      lines.push(chunk);
      n += chunk.length + 1;
    }
    return lines.join('\n').trim();
  } catch {
    return '';
  }
}

async function excerptHermesMemoryForEvolution(workspaceRoot: string, maxChars: number): Promise<string> {
  try {
    return buildHermesMemoryExcerpt(workspaceRoot, maxChars);
  } catch {
    return '';
  }
}

function aspectKeysFromPhases(phases: { aspect: EvolutionAspectKey; diff: { length: number } }[]): EvolutionAspectKey[] {
  return phases.filter((p) => p.diff.length > 0).map((p) => p.aspect);
}

async function finalizeEvolutionSuccess(params: {
  workspaceRoot: string;
  convId: string;
  /** 自动进化成功时写入的轮次；手动测试为 undefined（不改动累计轮次） */
  commitTotalRounds?: number;
  runId: string;
  combinedMessage: string;
  aggregateDiff: { relPath: string; kind: string }[];
  aspectKeys: EvolutionAspectKey[];
  manual?: boolean;
}): Promise<void> {
  const { workspaceRoot: root, convId, commitTotalRounds, runId, combinedMessage, aggregateDiff, aspectKeys, manual } =
    params;
  const total = commitTotalRounds ?? (await readSkillEvolutionState(root)).totalUserManualRounds;
  const label: Record<EvolutionAspectKey, string> = {
    memory: '记忆整理',
    skills: '技能维护',
    role_doc: '角色同步',
  };
  const titleZh =
    aspectKeys.length > 0
      ? `进化完成 · ${aspectKeys.map((k) => label[k]).join('、')}`
      : '进化完成 · 磁盘已更新';

  const diffText = formatEvolutionDiffLines(aggregateDiff as Parameters<typeof formatEvolutionDiffLines>[0], 36);

  const cur = await readSkillEvolutionState(root);
  if (typeof commitTotalRounds === 'number') {
    await writeSkillEvolutionState(root, { ...cur, totalUserManualRounds: commitTotalRounds });
  }
  await applySuccessfulEvolutionRewards(root, typeof commitTotalRounds === 'number' ? commitTotalRounds : cur.totalUserManualRounds);

  const summaryBody = [
    `### ${titleZh}`,
    '',
    '各阶段输出见上方卡片；以下为本次磁盘变更摘要：',
    '',
    diffText.trim() || '（无文件 diff）',
  ].join('\n');
  void appendEvolutionChatMessages(root, convId, [
    {
      content: summaryBody,
      meta: {
        evolutionRunId: runId,
        evolutionSegment: 'summary',
        evolutionStatus: 'ok',
        manual: Boolean(manual),
        diffCount: aggregateDiff.length,
      },
    },
  ]).catch(() => undefined);

  void appendWorkspaceChangeLog(root, {
    kind: 'evolution',
    title: manual ? `${titleZh}（手动）` : titleZh,
    conversationId: convId,
    userPreview: `触发轮次：${total}。变更文件 ${aggregateDiff.length} 项。\n${diffText}`,
    assistantExcerpt: combinedMessage.slice(0, 4000),
    meta: {
      evolutionOk: true,
      aspects: aspectKeys,
      totalUserManualRounds: total,
      runId,
      evolutionRunId: runId,
      diffCount: aggregateDiff.length,
      manual: Boolean(manual),
      revertible: true,
    },
  }).catch(() => undefined);
}

async function finalizeEvolutionFailure(params: {
  workspaceRoot: string;
  convId: string;
  total: number;
  runId: string;
  error: string;
  failureReason: string;
  manual?: boolean;
  rolledBackRounds: boolean;
}): Promise<void> {
  const { workspaceRoot: root, convId, total, runId, error, failureReason, manual, rolledBackRounds } = params;
  void appendEvolutionChatMessages(root, convId, [
    {
      content: [`### ${manual ? '进化失败（手动）' : '进化失败'}`, '', String(error).slice(0, 3500)].join('\n'),
      meta: {
        evolutionRunId: runId,
        evolutionSegment: 'summary',
        evolutionStatus: 'failed',
        manual: Boolean(manual),
        failureReason,
      },
    },
  ]).catch(() => undefined);

  void appendWorkspaceChangeLog(root, {
    kind: 'evolution',
    title: manual ? '进化失败（手动）' : '进化失败',
    conversationId: convId,
    userPreview: rolledBackRounds
      ? `第 ${total} 轮触发失败，已回滚轮次计数（仍为 ${total - 1}）。原因：${failureReason}`
      : `进化失败：${failureReason}`,
    assistantExcerpt: String(error).slice(0, 3500),
    meta: {
      evolutionOk: false,
      totalUserManualRounds: rolledBackRounds ? total - 1 : total,
      runId,
      evolutionRunId: runId,
      failureReason,
      manual: Boolean(manual),
      rolledBackRounds,
    },
  }).catch(() => undefined);
}

export async function maybeScheduleSkillEvolutionAfterMainTurn(params: {
  workspaceRoot: string;
  mainConversationId: string;
}): Promise<void> {
  const root = path.resolve(String(params.workspaceRoot ?? '').trim());
  const convId = String(params.mainConversationId ?? '').trim();
  if (!root || !convId) return;
  const tools = await readWorkspaceToolManifest(root);
  if (!tools.skills) return;

  const store = new SessionStore(root);
  const convs = await store.readAll();
  const c = convs.find((x) => x.id === convId);
  const messages = (c?.messages ?? []) as StoredMessage[];
  if (!lastRoundCountsTowardEvolution(messages)) return;

  const before = await readSkillEvolutionState(root);
  const prospectiveTotal = before.totalUserManualRounds + 1;
  const spacing = computeSkillEvolutionSpacing(prospectiveTotal);
  const shouldEvolve = prospectiveTotal > 0 && spacing > 0 && prospectiveTotal % spacing === 0;

  if (!shouldEvolve) {
    await writeSkillEvolutionState(root, { ...before, totalUserManualRounds: prospectiveTotal });
    return;
  }

  if (!evolutionToolsGate(tools)) {
    await writeSkillEvolutionState(root, { ...before, totalUserManualRounds: prospectiveTotal });
    void appendWorkspaceChangeLog(root, {
      kind: 'agent_dispatch',
      title: '进化跳过：需同时启用 docs 与 skills',
      conversationId: convId,
      userPreview: `已达第 ${prospectiveTotal} 轮间隔，但工具清单未同时开启「文档」与「技能」，未执行进化。`,
      assistantExcerpt: '请在 .agent/.tool 中启用 docs 与 skills 后，下一轮间隔将再次尝试。',
      meta: { dispatch: 'skill_evolution_skipped', reason: 'docs_or_skills_off', totalUserManualRounds: prospectiveTotal },
    }).catch(() => undefined);
    return;
  }

  const chatExcerpt = await excerptMainConversationSinceLastEvolution(root, convId, before.lastEvolutionAtMs, 8000);
  const memoryExcerpt = await excerptHermesMemoryForEvolution(root, 6000);

  void appendWorkspaceChangeLog(root, {
    kind: 'agent_dispatch',
    title: 'Agent 调度：进化（三阶段）',
    conversationId: convId,
    userPreview: `主会话轮次将达 ${prospectiveTotal}（每 ${spacing} 轮触发），依次执行：记忆整理 → 技能维护 → 角色同步。`,
    assistantExcerpt: '成功须通过磁盘 diff 验收；失败将回滚本轮轮次计数并恢复备份。',
    meta: { dispatch: 'skill_evolution', totalUserManualRounds: prospectiveTotal, spacing, phases: 3 },
  }).catch(() => undefined);

  void runEvolutionPipeline({
    workspaceRoot: root,
    triggerTotal: prospectiveTotal,
    spacing,
    chatExcerpt,
    memoryExcerpt,
    mainConversationId: convId,
  }).then(async (result) => {
    if (result.ok) {
      const aspectKeys = aspectKeysFromPhases(result.phases);
      await finalizeEvolutionSuccess({
        workspaceRoot: root,
        convId,
        commitTotalRounds: prospectiveTotal,
        runId: result.runId,
        combinedMessage: result.combinedMessage,
        aggregateDiff: result.aggregateDiff,
        aspectKeys: aspectKeys.length ? aspectKeys : classifyEvolutionOutcomeMarkdown(result.combinedMessage).aspectKeys,
      });
      return;
    }
    console.warn('[skill-agent] evolution pipeline failed:', result.failureReason, result.error);
    await finalizeEvolutionFailure({
      workspaceRoot: root,
      convId,
      total: prospectiveTotal,
      runId: result.runId,
      error: result.error,
      failureReason: result.failureReason,
      rolledBackRounds: true,
    });
  });
}

export async function runManualSkillEvolutionTest(params: {
  workspaceRoot: string;
  mainConversationId?: string;
}): Promise<{ ok: true; runId?: string } | { ok: false; error: string }> {
  const root = path.resolve(String(params.workspaceRoot ?? '').trim());
  if (!root) return { ok: false, error: 'no_workspace' };

  const tools = await readWorkspaceToolManifest(root);
  if (!tools.skills) return { ok: false, error: 'skills_disabled' };
  if (!evolutionToolsGate(tools)) return { ok: false, error: 'docs_disabled' };

  const store = new SessionStore(root);
  const convs = await store.readAll();
  let convId = String(params.mainConversationId ?? '').trim();
  if (convId) {
    const hit = convs.find((x) => x.id === convId);
    if (!hit) return { ok: false, error: 'no_conversation' };
  } else {
    const normalized = await store.normalizeToSingletonIfNeeded();
    convId = normalized[0]?.id ?? '';
    if (!convId) return { ok: false, error: 'no_conversation' };
  }

  const before = await readSkillEvolutionState(root);
  const chatExcerpt = await excerptMainConversationSinceLastEvolution(root, convId, before.lastEvolutionAtMs, 8000);
  const memoryExcerpt = await excerptHermesMemoryForEvolution(root, 6000);

  void appendWorkspaceChangeLog(root, {
    kind: 'agent_dispatch',
    title: '用户主动触发：技能进化（三阶段）',
    conversationId: convId,
    userPreview: `手动进化：记忆整理 → 技能维护 → 角色同步。当前累计轮次 ${before.totalUserManualRounds}。`,
    assistantExcerpt: '须产生磁盘 diff 方视为成功；失败不增加智能经验。',
    meta: { dispatch: 'skill_evolution_manual', manual: true },
  }).catch(() => undefined);

  releaseSystemSubAgentSlot(SKILL_AGENT_SLOT_ID);

  const result = await runEvolutionPipeline({
    workspaceRoot: root,
    manual: true,
    chatExcerpt,
    memoryExcerpt,
    mainConversationId: convId,
  });

  if (!result.ok) {
    const errKey =
      result.failureReason === 'evolution_timeout'
        ? 'evolution_timeout'
        : result.failureReason === 'no_disk_diff'
          ? 'no_disk_diff'
          : result.error.includes('slot_already_running')
            ? 'slot_already_running'
            : String(result.error ?? 'run_failed');
    await finalizeEvolutionFailure({
      workspaceRoot: root,
      convId,
      total: before.totalUserManualRounds,
      runId: result.runId,
      error: String(result.error),
      failureReason: result.failureReason,
      manual: true,
      rolledBackRounds: false,
    });
    return { ok: false, error: errKey };
  }

  const aspectKeys = aspectKeysFromPhases(result.phases);
  await finalizeEvolutionSuccess({
    workspaceRoot: root,
    convId,
    runId: result.runId,
    combinedMessage: result.combinedMessage,
    aggregateDiff: result.aggregateDiff,
    aspectKeys: aspectKeys.length ? aspectKeys : classifyEvolutionOutcomeMarkdown(result.combinedMessage).aspectKeys,
    manual: true,
  });

  return { ok: true, runId: result.runId };
}
