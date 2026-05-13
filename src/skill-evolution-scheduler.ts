/**
 * 主对话满足「用户手动或通讯端（飞书等）」完整轮次阈值后，触发 Skill Agent（进化）异步任务。
 */

import * as fs from 'fs';
import * as path from 'path';
import type { StoredMessage } from './engine/session-store';
import { SessionStore } from './engine/session-store';
import { readWorkspaceToolManifest } from './workspace-service';
import { applySuccessfulEvolutionRewards, readSkillEvolutionState, writeSkillEvolutionState } from './skill-evolution-state';
import { runSubAgentOnce } from './sub-agent-runner';
import {
  SKILL_AGENT_SLOT_ID,
  SKILL_AUDIT_EPHEMERAL_CONVERSATION_ID,
  computeSkillEvolutionSpacing,
} from './shared/skill-agent-constants';
import { workspaceAgentDotMemoryDirAbs } from './workspace-agent-layout';

/** 计入技能进化轮次的用户消息渠道（与 UI 内手动输入同级） */
const EVOLUTION_COUNTED_USER_CHANNELS = new Set<string>(['user_manual', 'user_feishu']);

function isEvolutionCountedUserMessage(m: StoredMessage): boolean {
  if (m.role !== 'user') return false;
  const ch = m.channel;
  if (!ch) return true;
  return EVOLUTION_COUNTED_USER_CHANNELS.has(ch);
}

/** 当前会话最后一条为 assistant，且其前最近一条「非 tool」用户来自手动或通讯端 */
function lastRoundCountsTowardEvolution(messages: StoredMessage[]): boolean {
  if (messages.length < 2) return false;
  const last = messages[messages.length - 1];
  if (last.role !== 'assistant') return false;
  if (last.channel === 'assistant_tool_summary') return false;
  for (let i = messages.length - 2; i >= 0; i--) {
    const m = messages[i];
    if (m.role === 'tool') continue;
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

  void runSubAgentOnce({
    workspaceRoot: root,
    slotId: SKILL_AGENT_SLOT_ID,
    taskText,
    conversationId: SKILL_AUDIT_EPHEMERAL_CONVERSATION_ID,
  }).then((res) => {
    if (!res.ok) {
      console.warn('[skill-agent] evolution run failed:', res.error);
      return;
    }
    void applySuccessfulEvolutionRewards(root, total).catch((e) =>
      console.warn('[skill-agent] apply evolution rewards failed:', e)
    );
    console.log('[skill-agent] evolution completed runId=', res.runId, 'totalRounds=', total);
  });
}
