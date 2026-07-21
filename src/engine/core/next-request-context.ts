/**
 * 与 sendMessage 前组装的 ChatMessage[] 对齐：用于「下一请求」上下文体积与溢出判断（非账单 token）。
 */

import { buildRoleAgentSystemContent } from '../core/role-agent-context';
import type { ChatMessage } from '../providers/types';
import type { StoredConversation, StoredMessage } from '../session/session-store';
import { resolveContextTokenLimit } from '../../utils/context-saturation';
import { readWorkspaceToolManifest } from '../../main/workspace/workspace-service';
import { buildSkillManifestSystemContent } from '../../main/workspace/workspace-skill-manifest';
import { repairToolCallMessageChain } from '../tool-runtime/repair-tool-call-message-chain';
import { truncateToolResultText } from '../../utils/tool-result-truncate';

/** 从持久化会话构造即将发给模型的 tail（不含 system；逻辑须与 ClawFlowEngine.buildHistoryMessages 一致） */
export function buildTailChatMessagesFromStored(conv: StoredConversation | null, userText: string): ChatMessage[] {
  const tail: ChatMessage[] = (conv?.messages ?? [])
    .filter((m): m is StoredMessage => {
      if (!m) return false;
      if (m.role === 'user' || m.role === 'assistant') return true;
      if (m.role !== 'tool') return false;
      const toolCallId = typeof (m as { tool_call_id?: string }).tool_call_id === 'string'
        ? String((m as { tool_call_id?: string }).tool_call_id).trim()
        : '';
      if (!toolCallId) return false;
      const meta = (m as { meta?: { status?: string } }).meta;
      const status = typeof meta?.status === 'string' ? meta.status : '';
      return status === 'result' || status === 'error' || !status;
    })
    .map((m) => ({
      role: m.role as ChatMessage['role'],
      content:
        m.role === 'tool'
          ? truncateToolResultText(String(m.content ?? ''))
          : String(m.content ?? ''),
      ...(typeof m.reasoning_content === 'string' ? { reasoning_content: m.reasoning_content } : {}),
      ...(Array.isArray(m.tool_calls) ? { tool_calls: m.tool_calls as ChatMessage['tool_calls'] } : {}),
      ...(m.role === 'tool' && typeof (m as { tool_call_id?: string }).tool_call_id === 'string'
        ? { tool_call_id: (m as { tool_call_id?: string }).tool_call_id }
        : {}),
    }));

  const ut = String(userText ?? '');
  if (ut.length > 0) {
    const last = tail[tail.length - 1];
    const alreadyHasUserTurn = last?.role === 'user' && String(last.content ?? '') === ut;
    if (!alreadyHasUserTurn) {
      tail.push({ role: 'user', content: ut });
    }
  }

  return tail;
}

export async function composeNextRequestChatMessages(params: {
  workspaceRoot: string;
  conversation: StoredConversation | null;
  pendingUserText: string;
}): Promise<ChatMessage[]> {
  const parts: string[] = [await buildRoleAgentSystemContent(params.workspaceRoot)];
  const tools = await readWorkspaceToolManifest(params.workspaceRoot);
  if (tools.skills) {
    parts.push('', await buildSkillManifestSystemContent(params.workspaceRoot));
  }
  const roleSystem = parts.join('\n');
  const tail = buildTailChatMessagesFromStored(params.conversation, params.pendingUserText);
  return repairToolCallMessageChain([{ role: 'system', content: roleSystem }, ...tail]);
}

/** 下一请求上下文分段（与 compose 逻辑一致；用于环形图占比） */
export type NextRequestContextSegmentId = 'role' | 'skills' | 'chat' | 'tools';

export type NextRequestContextSegment = {
  id: NextRequestContextSegmentId;
  utf8Bytes: number;
  loadUnits: number;
};

function utf8Len(s: string): number {
  return Buffer.byteLength(s, 'utf8');
}

function chatMessageUtf8Bytes(m: ChatMessage): number {
  return Buffer.byteLength(JSON.stringify(m), 'utf8');
}

/** 按角色/技能/对话正文/工具回执拆分体积（非账单 token） */
export async function computeNextRequestContextBreakdown(params: {
  workspaceRoot: string;
  conversation: StoredConversation | null;
  pendingUserText: string;
}): Promise<NextRequestContextSegment[]> {
  const roleContent = await buildRoleAgentSystemContent(params.workspaceRoot);
  const tools = await readWorkspaceToolManifest(params.workspaceRoot);
  const skillsContent = tools.skills ? await buildSkillManifestSystemContent(params.workspaceRoot) : '';
  const tail = buildTailChatMessagesFromStored(params.conversation, params.pendingUserText);

  const roleShell = chatMessageUtf8Bytes({ role: 'system', content: roleContent });
  const roleBytes = utf8Len(roleContent) + Math.max(0, roleShell - utf8Len(roleContent));

  let skillsBytes = 0;
  if (skillsContent) {
    const combined = `${roleContent}\n\n${skillsContent}`;
    const combinedShell = chatMessageUtf8Bytes({ role: 'system', content: combined });
    skillsBytes = Math.max(0, combinedShell - roleShell);
  }

  let chatBytes = 0;
  let toolsBytes = 0;
  for (const m of tail) {
    const b = chatMessageUtf8Bytes(m);
    if (m.role === 'tool') toolsBytes += b;
    else chatBytes += b;
  }

  const mk = (id: NextRequestContextSegmentId, utf8Bytes: number): NextRequestContextSegment => ({
    id,
    utf8Bytes,
    loadUnits: Math.max(0, Math.ceil(utf8Bytes / 4)),
  });

  return [mk('role', roleBytes), mk('skills', skillsBytes), mk('chat', chatBytes), mk('tools', toolsBytes)].filter(
    (s) => s.utf8Bytes > 0
  );
}

/** 下一请求 JSON 的 UTF-8 字节数（与序列化进 provider 的结构一致） */
export function measureChatMessagesUtf8Bytes(messages: readonly ChatMessage[]): number {
  return Buffer.byteLength(JSON.stringify(messages), 'utf8');
}

/**
 * 与模型上下文 token 上限同一量纲的「当量」：ceil(utf8Bytes/4)，便于与 resolveContextTokenLimit 比较做溢出判断。
 * 非精确 token，不用于计费。
 */
export function computeNextRequestContextStats(
  messages: readonly ChatMessage[],
  modelId: string | null | undefined
): {
  utf8Bytes: number;
  loadUnits: number;
  budgetUnits: number;
  ratio: number;
  isOverflow: boolean;
  isNearOverflow: boolean;
} {
  const utf8Bytes = measureChatMessagesUtf8Bytes(messages);
  const loadUnits = Math.max(0, Math.ceil(utf8Bytes / 4));
  const budgetUnits = Math.max(1, resolveContextTokenLimit(modelId));
  const ratio = Math.min(2, loadUnits / budgetUnits);
  const isOverflow = loadUnits >= budgetUnits;
  const isNearOverflow = !isOverflow && ratio >= 0.88;
  return { utf8Bytes, loadUnits, budgetUnits, ratio, isOverflow, isNearOverflow };
}
