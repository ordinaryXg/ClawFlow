import { normalizeWorkspacePathForCompare as normWorkspacePath } from '../../../shared/workspace-path-compare';
import type { ChatState, Conversation } from './chat-store-types';
import {
  mergeServerMessagesWithLocal,
  normalizeConversation,
  optimisticConversationWorkspace,
} from './chat-store-normalize';
import { cancelAssistantReveal, clearStreamingState, scheduleFetchConversations } from './chat-store-internals';

let fetchConversationsInflight: Promise<void> | null = null;

export async function runFetchConversations(
  set: (partial: Partial<ChatState> | ((s: ChatState) => Partial<ChatState>)) => void,
  get: () => ChatState,
  opts?: { immediate?: boolean }
): Promise<void> {
  if (!opts?.immediate) {
    scheduleFetchConversations(get, { immediate: false });
    return;
  }
  if (fetchConversationsInflight) return fetchConversationsInflight;

  fetchConversationsInflight = (async () => {
      cancelAssistantReveal();
      let activeWs = '';
      try {
        const a = await window.electronAPI?.workspaceGetActive?.();
        activeWs = normWorkspacePath(typeof a?.path === 'string' ? a.path : '');
      } catch {
        activeWs = '';
      }

      const prevFetchWs = get().conversationFetchWorkspaceKey ?? '';
      const workspaceSwitched =
        Boolean(activeWs && prevFetchWs) &&
        normWorkspacePath(activeWs) !== normWorkspacePath(prevFetchWs);
      if (workspaceSwitched) {
        set({
          messages: [],
          ...clearStreamingState(),
          activeModeClassification: null,
          isExpectationPlanning: false,
          expectationPlanStream: null,
          activeExpectationPlanDisplay: null,
          expectationPlanAnchorMessageId: null,
        });
      }

      try {
        const res = await window.electronAPI?.engineGetConversations?.();
        const rawList = Array.isArray(res) ? res : Array.isArray(res?.conversations) ? res.conversations : null;
        if (rawList == null) {
          // eslint-disable-next-line no-console
          console.warn('[chat] fetchConversations: 未收到有效 conversations 数组，保留当前界面状态', res);
          set({ error: '对话列表响应异常，未更新界面。请重试或检查主进程日志。' });
          return;
        }

        const fromRes = rawList.map(normalizeConversation).filter(Boolean) as Conversation[];
        const current = get().conversations;

        const mergedMap = new Map<string, Conversation>();
        for (const c of fromRes) mergedMap.set(c.id, c);
        for (const c of current) {
          if (mergedMap.has(c.id)) continue;
          if (optimisticConversationWorkspace.get(c.id) === activeWs) {
            mergedMap.set(c.id, c);
          }
        }
        const merged = Array.from(mergedMap.values()).sort((a, b) => b.updatedAt - a.updatedAt);

        for (const c of fromRes) {
          optimisticConversationWorkspace.delete(c.id);
        }

        const prev = get().activeConversationId;
        const stillValid = Boolean(prev && merged.some((c) => c.id === prev));
        const activeId = stillValid ? prev : (merged[0]?.id ?? null);
        const active = activeId ? merged.find((c) => c.id === activeId) : null;
        const prevMessages = get().messages;
        const canMergeLocalMessages =
          !workspaceSwitched && stillValid && activeId === prev && prevMessages.length > 0;
        const nextMessages =
          activeId && active
            ? canMergeLocalMessages
              ? mergeServerMessagesWithLocal(prevMessages, active.messages)
              : active.messages
            : (active?.messages ?? []);
        const conversationsWithMerged = merged.map((c) =>
          c.id === activeId ? { ...c, messages: nextMessages } : c
        );
        set({
          conversations: conversationsWithMerged,
          activeConversationId: activeId,
          messages: nextMessages,
          conversationFetchWorkspaceKey: activeWs || null,
          error: null,
        });
      } catch (e: any) {
        set({ error: e?.message || '获取对话历史失败' });
      }
  })();

  try {
    await fetchConversationsInflight;
  } finally {
    fetchConversationsInflight = null;
  }
}
