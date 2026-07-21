// store/modules/chatStore.ts — 对话状态管理（Zustand 入口）
import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import {
  removePendingSend as removePendingSendFromOrchestrator,
  routeOutboundSend,
  clearOutboundStateForConversation,
} from './chat-outbound-orchestrator';
import { getCachedOutboundMergeWindowMs } from '../../shared/outbound-merge-window-client';
import { normalizeWorkspacePathForCompare as normWorkspacePath } from '../../shared/workspace-path-compare';
import {
  cancelOutboundWsForConversation,
  sendGatewayChatMessage,
  wireChatGatewayHandlers,
} from './chat-gateway-client';

export type {
  ConversationModeClassification,
  PendingSendDisplayItem,
  ToolApprovalPendingState,
  MessageChannel,
  Message,
  Conversation,
  ChatState,
} from './chat-store/chat-store-types';
export {
  resolveMessagePresentationChannel,
  shouldShowMessageChannelStrip,
} from './chat-store/chat-store-types';

import type { ChatState, Message, MessageChannel } from './chat-store/chat-store-types';
import { conversationForEngineUpsert, optimisticConversationWorkspace } from './chat-store/chat-store-normalize';
import {
  cancelAssistantReveal,
  clearStreamingState,
  syncPendingSendQueueToStore,
} from './chat-store/chat-store-internals';
import { createOutboundTurnExecutor } from './chat-store/chat-store-outbound-turn';
import { runFetchConversations } from './chat-store/chat-store-fetch';

export const useChatStore = create<ChatState>()((set, get) => {
  wireChatGatewayHandlers({
    onToolApproval: (payload) => {
    const tools = Array.isArray(payload.tools)
      ? payload.tools
          .filter((t) => t && typeof t === 'object')
          .map((t) => ({
            name: String((t as { name?: string }).name ?? 'unknown'),
            argumentsPreview: String((t as { argumentsPreview?: string }).argumentsPreview ?? ''),
          }))
      : [];
    const approvalId = String(payload.approvalId ?? '').trim();
    if (!approvalId) return;
    const riskLevel = payload.riskLevel === 'high' ? 'high' : 'medium';
    const timeoutMsRaw = typeof payload.timeoutMs === 'number' && Number.isFinite(payload.timeoutMs) ? payload.timeoutMs : 20_000;
    const timeoutMs = Math.max(1000, Math.min(120_000, Math.floor(timeoutMsRaw)));
    const defaultApproved = typeof payload.defaultApproved === 'boolean' ? payload.defaultApproved : riskLevel === 'medium';
    const startedAt = Date.now();
    set({
      toolApprovalPending: {
        requestId: String(payload.requestId ?? ''),
        conversationId: String(payload.conversationId ?? ''),
        approvalId,
        tools,
        riskLevel,
        timeoutMs,
        defaultApproved,
        startedAt,
      },
    });
    },
    onToolApprovalCleared: (requestId) =>
      set((s) => (s.toolApprovalPending?.requestId === requestId ? { toolApprovalPending: null } : {})),
  });

  const executeOutboundTurn = createOutboundTurnExecutor(set, get);

  return {
  conversations: [],
  activeConversationId: null,
  messages: [],
  isLoading: false,
  streamingActivity: null,
  streamingToolHints: [],
  streamingThinking: null,
  error: null,
  activeModeClassification: null,
  isClassifyingMode: false,
  isExpectationPlanning: false,
  expectationPlanStream: null,
  activeExpectationPlanDisplay: null,
  expectationPlanAnchorMessageId: null,
  pendingSendQueue: [],
  toolApprovalPending: null,
  conversationFetchWorkspaceKey: null,

  removePendingSend: (id) => {
    const sessionId = get().activeConversationId;
    if (!sessionId) return;
    removePendingSendFromOrchestrator(sessionId, id);
    syncPendingSendQueueToStore(set, sessionId);
  },

  respondToolApproval: (approved: boolean) => {
    const pending = get().toolApprovalPending;
    if (!pending) return;
    set({ toolApprovalPending: null });
    void sendGatewayChatMessage({
      type: 'chat:toolApprovalResponse',
      requestId: pending.requestId,
      approvalId: pending.approvalId,
      approved,
    }).catch(() => undefined);
  },

  applyEvolutionChatUpdate: ({ conversationId, kind, message }) => {
    const convId = String(conversationId ?? '').trim();
    if (!convId || !message?.id) return;
    if (!get().conversations.some((c) => c.id === convId)) return;

    const mergeInto = (msgs: Message[]): Message[] => {
      const idx = msgs.findIndex((m) => m.id === message.id);
      if (kind === 'append' && idx < 0) {
        return [...msgs, message].sort((a, b) => a.timestamp - b.timestamp);
      }
      if (idx >= 0) {
        const next = [...msgs];
        next[idx] = { ...next[idx], ...message, id: message.id };
        return next;
      }
      return [...msgs, message].sort((a, b) => a.timestamp - b.timestamp);
    };

    const state = get();
    const conversations = state.conversations.map((c) =>
      c.id === convId ? { ...c, messages: mergeInto(c.messages), updatedAt: Date.now() } : c
    );
    const activeId = state.activeConversationId;
    const messages =
      activeId === convId ? mergeInto(state.messages) : state.messages;
    set({ conversations, messages });
  },

    fetchConversations: (opts) => runFetchConversations(set, get, opts),

  sendMessage: async (
    content: string,
    modelId?: string | null,
    opts?: { userChannel?: MessageChannel; scheduleFireReceipt?: { triggerId: string } }
  ) => {
    cancelAssistantReveal();
    const { activeConversationId } = get();

    let conversationId = activeConversationId;
    if (!conversationId) {
      await get().fetchConversations({ immediate: true });
      conversationId = get().activeConversationId;
    }

    if (!conversationId) {
      set({ isLoading: false, error: '当前工作区没有可用对话，请稍后重试或切换工作区。' });
      return;
    }
    const sessionId = conversationId;

    const userMessage: Message = {
      id: uuidv4(),
      role: 'user',
      content,
      timestamp: Date.now(),
      ...(opts?.userChannel ? { channel: opts.userChannel } : { channel: 'user_manual' as const }),
    };

    set((state) => {
      const updatedConversations = state.conversations.map((conv) => {
        if (conv.id === sessionId) {
          return {
            ...conv,
            messages: [...conv.messages, userMessage],
            updatedAt: Date.now(),
          };
        }
        return conv;
      });

      return {
        conversations: updatedConversations,
        messages: [...state.messages, userMessage],
        isLoading: true,
        ...clearStreamingState(),
        error: null,
        expectationPlanAnchorMessageId: userMessage.id,
        activeExpectationPlanDisplay: null,
        expectationPlanStream: null,
        isExpectationPlanning: false,
      };
    });

    try {
      const conv = get().conversations.find((c) => c.id === sessionId);
      if (conv) await window.electronAPI?.engineUpsertConversation?.(conversationForEngineUpsert(conv));
    } catch {
      // best-effort
    }

    const route = routeOutboundSend({
      conversationId: sessionId,
      content,
      modelId,
      mergeWindowMs: getCachedOutboundMergeWindowMs(),
      opts: opts
        ? {
            ...(opts.userChannel ? { userChannel: opts.userChannel } : {}),
            ...(opts.scheduleFireReceipt ? { scheduleFireReceipt: opts.scheduleFireReceipt } : {}),
          }
        : undefined,
    });
    syncPendingSendQueueToStore(set, sessionId);

    if (route.action === 'queue') {
      return;
    }

    if (route.action === 'merge') {
      cancelOutboundWsForConversation(sessionId);
      cancelAssistantReveal();
      set(clearStreamingState());
    }

    await executeOutboundTurn(route.turn);
  },

  createConversation: async () => {
    cancelAssistantReveal();
    await get().fetchConversations({ immediate: true });
  },

  switchConversation: (id: string) => {
    cancelAssistantReveal();
    const { conversations } = get();
    const conversation = conversations.find((conv) => conv.id === id);

    if (conversation) {
      set({
        activeConversationId: id,
        messages: conversation.messages,
        ...clearStreamingState(),
        error: null,
        isExpectationPlanning: false,
        expectationPlanStream: null,
        activeExpectationPlanDisplay: null,
        expectationPlanAnchorMessageId: null,
        activeModeClassification: null,
        isClassifyingMode: false,
      });
      syncPendingSendQueueToStore(set, id);
    }
  },

  deleteConversation: (id: string) => {
    cancelAssistantReveal();
    optimisticConversationWorkspace.delete(id);
    set((state) => {
      const updatedConversations = state.conversations.filter((conv) => conv.id !== id);
      const newActiveId =
        state.activeConversationId === id
          ? updatedConversations.length > 0
            ? updatedConversations[0].id
            : null
          : state.activeConversationId;

      return {
        conversations: updatedConversations,
        activeConversationId: newActiveId,
        messages: newActiveId
          ? updatedConversations.find((conv) => conv.id === newActiveId)?.messages || []
          : [],
        ...clearStreamingState(),
        error: null,
      };
    });

    void window.electronAPI?.engineDeleteConversation?.(id);
    clearOutboundStateForConversation(id);
    if (get().activeConversationId === id) syncPendingSendQueueToStore(set, get().activeConversationId);
  },

  clearMessages: () => {
    cancelAssistantReveal();
    const { activeConversationId, conversations } = get();
    if (!activeConversationId) return;

    const prev = conversations.find((c) => c.id === activeConversationId);
    if (!prev) return;

    const cleared = { ...prev, messages: [] as Message[], updatedAt: Date.now() };
    set({
      conversations: conversations.map((conv) => (conv.id === activeConversationId ? cleared : conv)),
      messages: [],
      ...clearStreamingState(),
    });
    void window.electronAPI?.engineUpsertConversation?.(conversationForEngineUpsert(cleared));
  },

  setError: (error: string | null) => {
    set({ error });
  },

  applyScheduleTrigger: async (payload: {
    workspaceRoot: string;
    text: string;
    submitToModel: boolean;
    triggerId?: string;
  }) => {
    const rawText = String(payload?.text ?? '').trim();
    if (!rawText) return;
    let activeWs = '';
    try {
      const a = await window.electronAPI?.workspaceGetActive?.();
      activeWs = normWorkspacePath(typeof a?.path === 'string' ? a.path : '');
    } catch {
      return;
    }
    if (activeWs !== normWorkspacePath(payload.workspaceRoot)) return;
    if (payload.submitToModel) {
      const tid = String(payload.triggerId ?? '').trim();
      await get().sendMessage(rawText, null, {
        userChannel: 'user_scheduling_auto',
        ...(tid ? { scheduleFireReceipt: { triggerId: tid } } : {}),
      });
      return;
    }
    cancelAssistantReveal();
    let conversationId = get().activeConversationId;
    if (!conversationId) {
      await get().fetchConversations({ immediate: true });
      conversationId = get().activeConversationId;
    }
    if (!conversationId) return;
    const sessionId = conversationId;
    const userMessage: Message = {
      id: uuidv4(),
      role: 'user',
      content: rawText,
      timestamp: Date.now(),
      channel: 'user_scheduling_auto',
    };
    set((state) => {
      const updatedConversations = state.conversations.map((conv) => {
        if (conv.id === sessionId) {
          return {
            ...conv,
            messages: [...conv.messages, userMessage],
            updatedAt: Date.now(),
          };
        }
        return conv;
      });
      return {
        conversations: updatedConversations,
        messages: [...state.messages, userMessage],
        error: null,
      };
    });
    try {
      const conv = get().conversations.find((c) => c.id === sessionId);
      if (conv) await window.electronAPI?.engineUpsertConversation?.(conversationForEngineUpsert(conv));
    } catch {
      /* ignore */
    }
  },
  };
});

export default useChatStore;
