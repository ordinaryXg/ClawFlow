// store/modules/chatStore.ts
// 对话状态管理

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
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
  sendMessage: (content: string) => Promise<void>;
  createConversation: () => void;
  switchConversation: (id: string) => void;
  deleteConversation: (id: string) => void;
  clearMessages: () => void;
  setError: (error: string | null) => void;
}

const TYPING_INTERVAL_MS = 18;

export const useChatStore = create<ChatState>()(
  persist(
    (set, get) => ({
      conversations: [],
      activeConversationId: null,
      messages: [],
      isLoading: false,
      streamingMessage: null,
      error: null,

      sendMessage: async (content: string) => {
        const now = Date.now();
        const { activeConversationId } = get();

        // 创建新对话（如果没有激活的对话）
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
        }

        // 添加用户消息
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
            }
          }, TYPING_INTERVAL_MS);
        };

        try {
          // 通过 IPC 调用 OpenClaw（当前主进程仍是“模拟”实现）
          const response = await window.electronAPI?.sendMessage?.(content);

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
    }),
    {
      name: 'cf.chat.v1',
      partialize: (state) => ({
        conversations: state.conversations,
        activeConversationId: state.activeConversationId,
      }),
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        const activeId = state.activeConversationId;
        if (!activeId) return;
        const active = state.conversations.find((c) => c.id === activeId);
        state.messages = active?.messages ?? [];
      },
    }
  )
);

export default useChatStore;
