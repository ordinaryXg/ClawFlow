// store/modules/chatStore.ts
// 对话状态管理

import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';

export type ChatInteractionMode = 'ask' | 'plan' | 'multitask';

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

export interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
}

function normalizeConversation(raw: unknown): Conversation | null {
  if (!raw || typeof raw !== 'object') return null;
  const c = raw as Record<string, unknown>;
  if (typeof c.id !== 'string') return null;
  const msgs = Array.isArray(c.messages) ? c.messages : [];
  const messages: Message[] = msgs
    .filter((m) => {
      const r = m as Record<string, unknown>;
      return r?.role === 'user' || r?.role === 'assistant';
    })
    .map((m: any) => ({
      id: typeof m?.id === 'string' ? m.id : uuidv4(),
      role: m.role as 'user' | 'assistant',
      content: String(m?.content ?? ''),
      timestamp: typeof m?.timestamp === 'number' ? m.timestamp : Date.now(),
    }));
  const now = Date.now();
  return {
    id: c.id,
    title: typeof c.title === 'string' ? c.title : '对话',
    messages,
    createdAt: typeof c.createdAt === 'number' ? c.createdAt : now,
    updatedAt: typeof c.updatedAt === 'number' ? c.updatedAt : now,
  };
}

export interface ChatState {
  conversations: Conversation[];
  activeConversationId: string | null;
  messages: Message[];
  isLoading: boolean;
  streamingMessage: string | null;
  error: string | null;
  interactionMode: ChatInteractionMode;

  // Actions
  fetchConversations: () => Promise<void>;
  sendMessage: (content: string, modelId?: string | null) => Promise<void>;
  createConversation: () => void;
  switchConversation: (id: string) => void;
  deleteConversation: (id: string) => void;
  clearMessages: () => void;
  setError: (error: string | null) => void;
  setInteractionMode: (mode: ChatInteractionMode) => void;
}

let revealCleanup: (() => void) | null = null;

function cancelAssistantReveal() {
  revealCleanup?.();
  revealCleanup = null;
}

export const useChatStore = create<ChatState>()((set, get) => ({
  conversations: [],
  activeConversationId: null,
  messages: [],
  isLoading: false,
  streamingMessage: null,
  error: null,
  interactionMode: 'ask',

  setInteractionMode: (mode) => set({ interactionMode: mode }),

  fetchConversations: async () => {
    cancelAssistantReveal();
    try {
      const res = await window.electronAPI?.engineGetConversations?.();
      const rawList = Array.isArray(res) ? res : Array.isArray(res?.conversations) ? res.conversations : null;
      if (!rawList) {
        set({
          conversations: [],
          activeConversationId: null,
          messages: [],
          error: null,
        });
        return;
      }

      const fromRes = rawList.map(normalizeConversation).filter(Boolean) as Conversation[];

      const prev = get().activeConversationId;
      const stillValid = Boolean(prev && fromRes.some((c) => c.id === prev));
      const activeId = stillValid ? prev : (fromRes[0]?.id ?? null);
      const active = activeId ? fromRes.find((c) => c.id === activeId) : null;
      set({
        conversations: fromRes,
        activeConversationId: activeId,
        messages: active?.messages ?? [],
        error: null,
      });
    } catch (e: any) {
      set({ error: e?.message || '获取对话历史失败' });
    }
  },

  sendMessage: async (content: string, modelId?: string | null) => {
    cancelAssistantReveal();
    const now = Date.now();
    const { activeConversationId, interactionMode } = get();

    let conversationId = activeConversationId;
    if (!conversationId) {
      const newConversation: Conversation = {
        id: uuidv4(),
        title: content.slice(0, 20) || '新对话',
        messages: [],
        createdAt: now,
        updatedAt: now,
      };
      conversationId = newConversation.id;
      set((state) => ({
        conversations: [...state.conversations, newConversation],
        activeConversationId: conversationId,
        messages: [],
        error: null,
      }));
      void window.electronAPI?.engineUpsertConversation?.(newConversation);
    }

    if (!conversationId) {
      set({ isLoading: false, error: '无法创建会话' });
      return;
    }
    const sessionId = conversationId;

    const userMessage: Message = {
      id: uuidv4(),
      role: 'user',
      content,
      timestamp: Date.now(),
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
        streamingMessage: null,
        error: null,
      };
    });

    try {
      const conv = get().conversations.find((c) => c.id === sessionId);
      if (conv) await window.electronAPI?.engineUpsertConversation?.(conv);
    } catch {
      // best-effort
    }

    try {
      const t0 = performance.now();

      const finalizeReply = (fullText: string, log?: { ipcMs: number; label: string }) => {
        const assistantMessage: Message = {
          id: uuidv4(),
          role: 'assistant',
          content: fullText,
          timestamp: Date.now(),
        };

        set((state) => {
          const updatedConversations = state.conversations.map((conv) => {
            if (conv.id === sessionId) {
              return {
                ...conv,
                messages: [...conv.messages, assistantMessage],
                updatedAt: Date.now(),
              };
            }
            return conv;
          });

          return {
            conversations: updatedConversations,
            messages: [...state.messages, assistantMessage],
            isLoading: false,
            streamingMessage: null,
          };
        });

        void Promise.resolve(
          window.electronAPI?.workspaceAppendChangeLog?.({
            conversationId: sessionId,
            userPreview: content,
            assistantExcerpt: fullText,
          })
        ).then((res) => {
          if (res && typeof res === 'object' && 'ok' in res && res.ok) {
            window.dispatchEvent(new CustomEvent('cf-workspace-changelog-updated'));
          }
        });

        const ipcMs = log?.ipcMs ?? Math.round(performance.now() - t0);
        // eslint-disable-next-line no-console
        console.log(
          `[chat] sendMessage engine=builtin ${log?.label ? `${log.label} ` : ''}ipc_ms=${ipcMs} chars=${fullText.length} mode=${interactionMode}`
        );
      };

      const useBuiltinStream =
        (interactionMode === 'ask' || interactionMode === 'plan') &&
        typeof window.electronAPI?.engineSendMessageStream === 'function' &&
        typeof window.electronAPI?.onEngineChatStream === 'function';

      if (useBuiltinStream) {
        cancelAssistantReveal();
        set({ streamingMessage: '' });
        const unsub = window.electronAPI.onEngineChatStream((ev) => {
          if (ev.conversationId !== sessionId) return;
          set((s) => ({ streamingMessage: (s.streamingMessage ?? '') + ev.text }));
        });
        try {
          const response = await window.electronAPI.engineSendMessageStream({
            conversationId: sessionId,
            userText: content,
            ...(modelId ? { modelId } : {}),
            mode: interactionMode === 'plan' ? 'plan' : 'ask',
          });
          const t1 = performance.now();
          const replyText =
            (typeof response?.message === 'string' && response.message) ||
            `这是对"${content}"的回复（模拟）`;
          finalizeReply(replyText, { ipcMs: Math.round(t1 - t0), label: 'stream' });
        } finally {
          unsub();
        }
        return;
      }

      const response = await window.electronAPI?.engineSendMessage?.({
        conversationId: sessionId,
        userText: content,
        mode: interactionMode,
        ...(modelId ? { modelId } : {}),
      });
      const t1 = performance.now();

      const replyText =
        (typeof response?.message === 'string' && response.message) ||
        (typeof response === 'string' && response) ||
        `这是对"${content}"的回复（模拟）`;

      cancelAssistantReveal();

      set({ streamingMessage: '' });

      let raf = 0;
      let stopped = false;
      const cleanup = () => {
        stopped = true;
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
      };
      revealCleanup = cleanup;

      const revealStart = performance.now();
      const revealDurationMs = Math.min(900, Math.max(280, Math.floor(replyText.length * 0.45)));

      const tick = () => {
        if (stopped) return;
        const u = Math.min(1, (performance.now() - revealStart) / revealDurationMs);
        const smooth = u * u * (3 - 2 * u);
        const n = Math.min(replyText.length, Math.max(0, Math.round(replyText.length * smooth)));
        set({ streamingMessage: replyText.slice(0, n) });
        if (u >= 1) {
          revealCleanup = null;
          finalizeReply(replyText, { ipcMs: Math.round(t1 - t0), label: 'reveal' });
          return;
        }
        raf = requestAnimationFrame(tick);
      };

      raf = requestAnimationFrame(tick);
    } catch (error: any) {
      cancelAssistantReveal();
      set({
        isLoading: false,
        streamingMessage: null,
        error: error?.message || '发送消息失败',
      });
    }
  },

  createConversation: () => {
    cancelAssistantReveal();
    const newConversation: Conversation = {
      id: uuidv4(),
      title: '新对话',
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    set((state) => ({
      conversations: [...state.conversations, newConversation],
      activeConversationId: newConversation.id,
      messages: [],
      streamingMessage: null,
      error: null,
    }));

    void window.electronAPI?.engineUpsertConversation?.(newConversation);
  },

  switchConversation: (id: string) => {
    cancelAssistantReveal();
    const { conversations } = get();
    const conversation = conversations.find((conv) => conv.id === id);

    if (conversation) {
      set({
        activeConversationId: id,
        messages: conversation.messages,
        streamingMessage: null,
        error: null,
      });
    }
  },

  deleteConversation: (id: string) => {
    cancelAssistantReveal();
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
        streamingMessage: null,
        error: null,
      };
    });

    void window.electronAPI?.engineDeleteConversation?.(id);
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
      streamingMessage: null,
    });
    void window.electronAPI?.engineUpsertConversation?.(cleared);
  },

  setError: (error: string | null) => {
    set({ error });
  },
}));

export default useChatStore;
