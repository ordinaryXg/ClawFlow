/**
 * 主对话满足「用户手动或通讯端（飞书等）」完整轮次阈值后，触发 Skill Agent（进化）异步任务。
 */

import * as fs from 'fs';
import * as path from 'path';
import type { StoredMessage } from '../../engine/session-store';
import { SessionStore } from '../../engine/session-store';
import { readWorkspaceToolManifest } from '../workspace/workspace-service';
import { applySuccessfulEvolutionRewards, readSkillEvolutionState, writeSkillEvolutionState } from './skill-evolution-state';
import { runSystemSubAgentOnce } from '../system-agents/system-sub-agent-runner';
import {
  SKILL_AGENT_SLOT_ID,
  SKILL_AUDIT_EPHEMERAL_CONVERSATION_ID,
  computeSkillEvolutionSpacing,
} from '../../shared/skill-agent-constants';
import { workspaceAgentDotMemoryDirAbs } from '../workspace/workspace-agent-layout';
import { appendWorkspaceChangeLog } from '../workspace/workspace-change-log';

export type EvolutionAspectKey = 'memory' | 'skills' | 'role_doc';

/** 从进化 Agent 最终输出中粗分类涉及的工作区维度（用于变更记录标题与 meta）。 */
export function classifyEvolutionOutcomeMarkdown(text: string): {
  aspectKeys: EvolutionAspectKey[];
  titleZh: string;
} {
  const sample = text.slice(0, 24_000);
  const keys = new Set<EvolutionAspectKey>();
  if (/[\\/]\.agent[\\/]\.memory|记忆库|记忆瘦身|\.memory[\\/]/i.test(sample)) keys.add('memory');
  if (/[\\/]\.agent[\\/]\.skills|Hermes|SKILL\.md|技能/i.test(sample)) keys.add('skills');
  if (/AGENTS\.md|SOUL\.md|角色文档|[\\/]\.roleAgent[\\/]/i.test(sample)) keys.add('role_doc');
  const order: EvolutionAspectKey[] = ['memory', 'skills', 'role_doc'];
  const aspectKeys = order.filter((k) => keys.has(k));
  const label: Record<EvolutionAspectKey, string> = {
    memory: '记忆库',
    skills: '技能（Hermes）',
    role_doc: '角色文档',
  };
  const titleZh =
    aspectKeys.length > 0 ? `进化完成 · ${aspectKeys.map((k) => label[k]).join('、')}` : '进化完成 · 综合更新';
  return { aspectKeys, titleZh };
}

/**
 * 轮次统计（totalUserManualRounds）约定：
 * - 仅在主会话一次「用户有效提问 → 引擎落盘最终 assistant」完成后，由 ClawFlowEngine.fireSkillEvolutionHookIfNeeded
 *   调用 maybeScheduleSkillEvolutionAfterMainTurn；子 Agent / 审计会话 / assistant_tool_summary 整段不落计数。
 * - 一条「回合」对应：会话末尾为普通 assistant，且从末尾向前跳过 tool 与中间 assistant（含带 tool_calls 的片段）
 *   后，遇到的最近一条 user 的渠道为 user_manual 或 user_feishu（无 channel 视为历史数据，仍计入）。
 * - 含多轮工具调用时持久化形如：… user → assistant(tool_calls) → tool → … → assistant(最终正文)，旧逻辑在向前扫描时
 *   会先碰到中间 assistant 并误判为 false，导致轮次几乎不增长；此处对中间 assistant 一律跳过。
 */
/** 计入技能进化轮次的用户消息渠道（与 UI 内手动输入同级） */
const EVOLUTION_COUNTED_USER_CHANNELS = new Set<string>(['user_manual', 'user_feishu']);

export function isEvolutionCountedUserMessage(m: StoredMessage): boolean {
  if (m.role !== 'user') return false;
  const ch = m.channel;
  if (!ch) return true;
  return EVOLUTION_COUNTED_USER_CHANNELS.has(ch);
}

/** 当前会话最后一条为可计数的 assistant，且向前跳过 tool / 中间 assistant 后，最近一条 user 为可计数渠道 */
export function lastRoundCountsTowardEvolution(messages: StoredMessage[]): boolean {
  if (messages.length < 2) return false;
  const last = messages[messages.length - 1];
  if (last.role !== 'assistant') return false;
  if (last.channel === 'assistant_tool_summary') return false;
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

async function excerptDotMemoryMarkdown(workspaceRoot: string, maxChars: number): Promise<string> {
  const dir = workspaceAgentDotMemoryDirAbs(workspaceRoot);
  const parts: string[] = [];
  let used = 0;
  try {
    const names = await fs.promises.readdir(dir);
    const mds = names.filter((n) => n.endsWith('.md')).sort();
    for (const name of mds) {
      if (used >= maxChars) break;
      const p = path.join(dir, name);
      const st = await fs.promises.stat(p).catch(() => null);
      if (!st?.isFile()) continue;
      const raw = await fs.promises.readFile(p, 'utf8').catch(() => '');
      const header = `\n### .agent/.memory/${name}\n`;
      const rest = raw.slice(0, Math.max(0, maxChars - used - header.length));
      parts.push(header + rest);
      used += header.length + rest.length;
    }
  } catch {
    /* ignore */
  }
  return parts.join('\n').trim();
}

function buildSkillEvolutionTask(params: { chatExcerpt: string; memoryExcerpt: string }): string {
  const chat = params.chatExcerpt.trim() || '（自上次进化以来的主对话摘录不可用。）';
  const mem = params.memoryExcerpt.trim() || '（.agent/.memory 下暂无可读 Markdown 或目录为空。）';
  return [
    '【主工作区进化 Agent — 本轮任务】',
    '',
    '## 一、搜集与整合',
    '合并以下两类材料，形成你内部的「工作区上下文快照」（不要逐字复述给用户）：',
    '1) 自**上次成功进化**以来，主 Agent 与用户（含应用内与飞书等通讯端）的对话摘录（见下方「对话摘录」）。',
    '2) 旧有主 Agent 记忆库：`.agent/.memory/` 下已有 Markdown（见「记忆库摘录」）。',
    '',
    '### 对话摘录',
    '---',
    chat,
    '---',
    '',
    '### 记忆库摘录（.agent/.memory）',
    '---',
    mem,
    '---',
    '',
    '## 二、记忆瘦身与再编排',
    '判断上述内容是否冗余、重复或过期；**剔除**明显无用的对话式流水账，将可长期复用的结论、偏好、术语、项目约束等，**重新编排**写入 `.agent/.memory/`（可更新/新建 `.md`，保持文件名可读；不要写入密钥）。',
    '',
    '## 三、编写适用的 Skills',
    '在 **`.agent/.skills/`** 下，基于新的记忆与对话主题，创建或**最小改动**更新 Hermes 技能（`SKILL.md` + 必要时 `references/`），遵守工作区工具与白名单；优先小步、可回滚。',
    '',
    '## 四、扩写主 Agent 角色文档',
    '根据新的记忆库与技能现状，**扩写**（在保留用户已有立意的前提下补充段落，避免整文件覆盖）以下文件（路径相对工作区根）：',
    '- `.agent/.roleAgent/AGENTS.md`',
    '- `.agent/.roleAgent/SOUL.md`',
    '',
    '## 收尾',
    '用 6 条以内要点总结本轮：记忆变更摘要、技能变更摘要、角色文档变更摘要、风险与后续建议。',
  ].join('\n');
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
  const total = before.totalUserManualRounds + 1;
  const spacing = computeSkillEvolutionSpacing(total);
  const shouldEvolve = total > 0 && spacing > 0 && total % spacing === 0;

  await writeSkillEvolutionState(root, {
    ...before,
    totalUserManualRounds: total,
  });

  if (!shouldEvolve) return;

  const chatExcerpt = await excerptMainConversationSinceLastEvolution(
    root,
    convId,
    before.lastEvolutionAtMs,
    8000
  );
  const memoryExcerpt = await excerptDotMemoryMarkdown(root, 6000);
  const taskText = buildSkillEvolutionTask({ chatExcerpt, memoryExcerpt });

  void appendWorkspaceChangeLog(root, {
    kind: 'agent_dispatch',
    title: 'Agent 调度：进化（Skill Agent）',
    conversationId: convId,
    userPreview: `主会话轮次累计至 ${total}，已达进化间隔（每 ${spacing} 轮），已启动 Skill Agent（槽位 ${SKILL_AGENT_SLOT_ID}）。`,
    assistantExcerpt:
      '本轮任务覆盖：合并近期对话与 .agent/.memory 摘录、记忆瘦身、在 .agent/.skills 下维护 Hermes 技能、扩写 .agent/.roleAgent 下 AGENTS.md / SOUL.md。',
    meta: { dispatch: 'skill_evolution', totalUserManualRounds: total, spacing },
  }).catch(() => undefined);

  void runSystemSubAgentOnce({
    workspaceRoot: root,
    slotId: SKILL_AGENT_SLOT_ID,
    taskText,
    conversationId: SKILL_AUDIT_EPHEMERAL_CONVERSATION_ID,
  }).then((res) => {
    if (!res.ok) {
      console.warn('[skill-agent] evolution run failed:', res.error);
      void appendWorkspaceChangeLog(root, {
        kind: 'evolution',
        title: '进化失败',
        conversationId: convId,
        userPreview: `第 ${total} 轮触发后执行失败，未应用进化奖励（经验/轮次标记）。`,
        assistantExcerpt: String(res.error ?? '').slice(0, 3500),
        meta: { evolutionOk: false, totalUserManualRounds: total, runId: res.runId },
      }).catch(() => undefined);
      return;
    }
    const { aspectKeys, titleZh } = classifyEvolutionOutcomeMarkdown(res.message || '');
    void appendWorkspaceChangeLog(root, {
      kind: 'evolution',
      title: titleZh,
      conversationId: convId,
      userPreview: `触发轮次：${total}。解析维度：${aspectKeys.length ? aspectKeys.join('、') : '（输出中未匹配到明确关键词，可能为概述性总结）'}`,
      assistantExcerpt: (res.message || '').slice(0, 4000),
      meta: {
        evolutionOk: true,
        aspects: aspectKeys,
        totalUserManualRounds: total,
        runId: res.runId,
      },
    }).catch(() => undefined);
    void applySuccessfulEvolutionRewards(root, total).catch((e) =>
      console.warn('[skill-agent] apply evolution rewards failed:', e)
    );
  });
}

/**
 * 用户主动触发一次与「自动进化」相同的 Skill Agent 任务（不依赖轮次间隔），用于联调 / 验证进化管线。
 * 仍要求工作区 manifest 已启用 `tools.skills`。
 */
export async function runManualSkillEvolutionTest(params: {
  workspaceRoot: string;
  mainConversationId?: string;
}): Promise<{ ok: true; runId?: string } | { ok: false; error: string }> {
  const root = path.resolve(String(params.workspaceRoot ?? '').trim());
  if (!root) return { ok: false, error: 'no_workspace' };

  const tools = await readWorkspaceToolManifest(root);
  if (!tools.skills) {
    return { ok: false, error: 'skills_disabled' };
  }

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
  const memoryExcerpt = await excerptDotMemoryMarkdown(root, 6000);
  const taskText = buildSkillEvolutionTask({ chatExcerpt, memoryExcerpt });

  void appendWorkspaceChangeLog(root, {
    kind: 'agent_dispatch',
    title: '用户主动触发：技能进化（测试）',
    conversationId: convId,
    userPreview: `手动测试进化：已启动 Skill Agent（槽位 ${SKILL_AGENT_SLOT_ID}），不依赖轮次间隔。当前累计轮次 ${before.totalUserManualRounds}。`,
    assistantExcerpt:
      '与自动进化相同的任务说明：合并近期主对话与 .agent/.memory、维护 .agent/.skills、扩写 .agent/.roleAgent 下角色文档。',
    meta: { dispatch: 'skill_evolution_manual', manual: true },
  }).catch(() => undefined);

  const res = await runSystemSubAgentOnce({
    workspaceRoot: root,
    slotId: SKILL_AGENT_SLOT_ID,
    taskText,
    conversationId: SKILL_AUDIT_EPHEMERAL_CONVERSATION_ID,
  });

  if (!res.ok) {
    void appendWorkspaceChangeLog(root, {
      kind: 'evolution',
      title: '主动进化（测试）失败',
      conversationId: convId,
      userPreview: '手动触发的 Skill Agent 未成功完成。',
      assistantExcerpt: String(res.error ?? '').slice(0, 3500),
      meta: { evolutionOk: false, manual: true, runId: res.runId },
    }).catch(() => undefined);
    return { ok: false, error: String(res.error ?? 'run_failed') };
  }

  const { aspectKeys, titleZh } = classifyEvolutionOutcomeMarkdown(res.message || '');
  void appendWorkspaceChangeLog(root, {
    kind: 'evolution',
    title: `${titleZh}（手动测试）`,
    conversationId: convId,
    userPreview: `主动触发完成。解析维度：${aspectKeys.length ? aspectKeys.join('、') : '（概述）'}`,
    assistantExcerpt: (res.message || '').slice(0, 4000),
    meta: { evolutionOk: true, aspects: aspectKeys, manual: true, runId: res.runId },
  }).catch(() => undefined);

  await applySuccessfulEvolutionRewards(root, before.totalUserManualRounds);
  return { ok: true, runId: res.runId };
}
