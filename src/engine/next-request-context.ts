/**
 * 与 sendMessage 前组装的 ChatMessage[] 对齐：用于「下一请求」上下文体积与溢出判断（非账单 token）。
 */

import { buildRoleAgentSystemContent } from './role-agent-context';
import type { ChatMessage } from './providers/types';
import type { StoredConversation, StoredMessage } from './session-store';
import { resolveContextTokenLimit } from '../utils/context-saturation';
import { readWorkspaceToolManifest } from '../main/workspace/workspace-service';
import { buildSkillManifestSystemContent } from '../main/workspace/workspace-skill-manifest';
import { repairToolCallMessageChain } from './repair-tool-call-message-chain';

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
      content: String(m.content ?? ''),
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
