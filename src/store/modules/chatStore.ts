// store/modules/chatStore.ts
// 对话状态管理

import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';

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

export interface ChatState {
  conversations: Conversation[];
  activeConversationId: string | null;
  messages: Message[];
  isLoading: boolean;
  streamingMessage: string | null;
  error: string | null;
  
  // Actions
  fetchConversations: () => Promise<void>;
  sendMessage: (content: string, modelId?: string | null) => Promise<void>;
  createConversation: () => void;
  switchConversation: (id: string) => void;
  deleteConversation: (id: string) => void;
  clearMessages: () => void;
  setError: (error: string | null) => void;
}

const TYPING_INTERVAL_MS = 18;

export const useChatStore = create<ChatState>()((set, get) => ({
  conversations: [],
  activeConversationId: null,
  messages: [],
  isLoading: false,
  streamingMessage: null,
  error: null,

  fetchConversations: async () => {
    try {
      const res = await window.electronAPI?.getConversations?.();
      const fromRes = Array.isArray(res) ? res : Array.isArray(res?.conversations) ? res.conversations : null;
      if (!fromRes) {
        set({
          conversations: [],
          activeConversationId: null,
          messages: [],
          error: null,
        });
        return;
      }

      const prev = get().activeConversationId;
      const stillValid = Boolean(prev && fromRes.some((c: any) => c.id === prev));
      const activeId = stillValid ? prev : (fromRes[0]?.id ?? null);
      const active = activeId ? fromRes.find((c: any) => c.id === activeId) : null;
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
    const now = Date.now();
    const { activeConversationId } = get();

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
      void window.electronAPI?.upsertConversation?.(newConversation);
    }

    const userMessage: Message = {
      id: uuidv4(),
      role: 'user',
      content,
      timestamp: Date.now(),
    };

    set((state) => {
      const updatedConversations = state.conversations.map((conv) => {
        if (conv.id === conversationId) {
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
        streamingMessage: '',
        error: null,
      };
    });

    try {
      const conv = get().conversations.find((c) => c.id === conversationId);
      if (conv) await window.electronAPI?.upsertConversation?.(conv);
    } catch {
      // best-effort
    }

    const runTyping = (fullText: string) => {
      let i = 0;
      const timer = setInterval(() => {
        i += 1;
        const next = fullText.slice(0, i);
        set({ streamingMessage: next });
        if (i >= fullText.length) {
          clearInterval(timer);
          const assistantMessage: Message = {
            id: uuidv4(),
            role: 'assistant',
            content: fullText,
            timestamp: Date.now(),
          };

          set((state) => {
            const updatedConversations = state.conversations.map((conv) => {
              if (conv.id === conversationId) {
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

          try {
            const conv = get().conversations.find((c) => c.id === conversationId);
            if (conv) void window.electronAPI?.upsertConversation?.(conv);
          } catch {
            // best-effort
          }
        }
      }, TYPING_INTERVAL_MS);
    };

    try {
      const response = await window.electronAPI?.sendMessage?.(content, conversationId, modelId || undefined);

      const replyText =
        (typeof response?.message === 'string' && response.message) ||
        (typeof response === 'string' && response) ||
        `这是对"${content}"的回复（模拟）`;

      runTyping(replyText);
    } catch (error: any) {
      set({
        isLoading: false,
        streamingMessage: null,
        error: error?.message || '发送消息失败',
      });
    }
  },

  createConversation: () => {
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

    void window.electronAPI?.upsertConversation?.(newConversation);
  },

  switchConversation: (id: string) => {
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

    void window.electronAPI?.deleteConversation?.(id);
  },

  clearMessages: () => {
    const { activeConversationId } = get();

    if (activeConversationId) {
      set((state) => {
        const updatedConversations = state.conversations.map((conv) => {
          if (conv.id === activeConversationId) {
            return { ...conv, messages: [], updatedAt: Date.now() };
          }
          return conv;
        });

        return {
          conversations: updatedConversations,
          messages: [],
          streamingMessage: null,
        };
      });
    }
  },

  setError: (error: string | null) => {
    set({ error });
  },
}));

export default useChatStore;
