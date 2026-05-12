/**
 * 主对话每 N 轮完成后触发 Skill Agent 进化审核（异步，不阻塞主会话）。
 */

import * as path from 'path';
import { SessionStore } from './engine/session-store';
import { readWorkspaceToolManifest } from './workspace-service';
import {
  incrementMainTurnsSinceSkillAudit,
  resetSkillAuditTurnCounter,
} from './skill-evolution-state';
import { runSubAgentOnce } from './sub-agent-runner';
import {
  SKILL_AGENT_SLOT_ID,
  SKILL_AUDIT_EPHEMERAL_CONVERSATION_ID,
  SKILL_EVOLUTION_INTERVAL_MAIN_TURNS,
} from './shared/skill-agent-constants';

async function excerptMainConversationAsync(
  workspaceRoot: string,
  mainConversationId: string,
  maxChars: number
): Promise<string> {
  try {
    const store = new SessionStore(workspaceRoot);
    const convs = await store.readAll();
    const c = convs.find((x) => x.id === mainConversationId);
    const msgs = (c?.messages ?? []).filter((m) => m && (m.role === 'user' || m.role === 'assistant'));
    const tail = msgs.slice(-24);
    const lines: string[] = [];
    let n = 0;
    for (const m of tail) {
      const role = m.role === 'user' ? 'User' : 'Assistant';
      const chunk = `[${role}] ${String(m.content ?? '').slice(0, 800)}`;
      if (n + chunk.length > maxChars) break;
      lines.push(chunk);
      n += chunk.length + 1;
    }
    return lines.join('\n').trim();
  } catch {
    return '';
  }
}

function buildSkillEvolutionTask(mainChatExcerpt: string): string {
  const excerpt = mainChatExcerpt.trim() || '（近期主对话摘要不可用，请仅依据技能树与知识库执行审查。）';
  return [
    '【技能进化审核】',
    '',
    '以下为最近主对话摘录（仅供对齐主题，勿复述给用户）：',
    '---',
    excerpt,
    '---',
    '',
    '请完成本轮审查与必要的落盘变更：',
    '1) 列举当前 `.agent/.skills` 技能（`workspace_skill_list`），必要时 `workspace_knowledge_query` / `workspace_memory_search` 检索缺口。',
    '2) 结合摘录中的用户意图/术语，判断需新建技能、拆分/合并目录、或更新 SKILL.md / references。',
    '3) 执行最小可行改动（优先 patch 与 references），并在结尾用 5 条以内要点总结本轮结论与后续建议。',
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

  const turns = await incrementMainTurnsSinceSkillAudit(root);
  if (turns < SKILL_EVOLUTION_INTERVAL_MAIN_TURNS) return;

  await resetSkillAuditTurnCounter(root);

  const excerpt = await excerptMainConversationAsync(root, convId, 6000);
  const taskText = buildSkillEvolutionTask(excerpt);

  void runSubAgentOnce({
    workspaceRoot: root,
    slotId: SKILL_AGENT_SLOT_ID,
    taskText,
    conversationId: SKILL_AUDIT_EPHEMERAL_CONVERSATION_ID,
  }).then((res) => {
    if (!res.ok) {
      console.warn('[skill-agent] evolution audit run failed:', res.error);
    } else {
      console.log('[skill-agent] evolution audit completed runId=', res.runId);
    }
  });
}
