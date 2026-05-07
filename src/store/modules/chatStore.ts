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
  sendMessage: (content: string) => Promise<void>;
  createConversation: () => void;
  switchConversation: (id: string) => void;
  deleteConversation: (id: string) => void;
  clearMessages: () => void;
  setError: (error: string | null) => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  conversations: [],
  activeConversationId: null,
  messages: [],
  isLoading: false,
  streamingMessage: null,
  error: null,
  
  sendMessage: async (content: string) => {
    const { activeConversationId, conversations } = get();
    
    // 创建新对话（如果没有激活的对话）
    let conversationId = activeConversationId;
    if (!conversationId) {
      const newConversation: Conversation = {
        id: uuidv4(),
        title: content.slice(0, 20) || '新对话',
        messages: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      conversationId = newConversation.id;
      set(state => ({ 
        conversations: [...state.conversations, newConversation],
        activeConversationId: conversationId 
      }));
    }
    
    // 添加用户消息
    const userMessage: Message = {
      id: uuidv4(),
      role: 'user',
      content,
      timestamp: Date.now(),
    };
    
    set(state => {
      const updatedConversations = state.conversations.map(conv => {
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
        error: null,
      };
    });
    
    try {
      // 调用 OpenClaw API（通过 IPC）
      // 注意：这里需要根据实际的 OpenClaw API 来实现
      // 目前先模拟响应
      set({ 
        streamingMessage: '正在思考...',
      });
      
      // TODO: 实现真正的 OpenClaw API 调用
      // const response = await window.electronAPI?.sendMessage(content);
      
      // 模拟响应
      setTimeout(() => {
        const assistantMessage: Message = {
          id: uuidv4(),
          role: 'assistant',
          content: `这是对"${content}"的回复（模拟）`,
          timestamp: Date.now(),
        };
        
        set(state => {
          const updatedConversations = state.conversations.map(conv => {
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
      }, 1000);
    } catch (error: any) {
      set({ 
        isLoading: false,
        streamingMessage: null,
        error: error.message || '发送消息失败' 
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
    
    set(state => ({ 
      conversations: [...state.conversations, newConversation],
      activeConversationId: newConversation.id,
      messages: [],
    }));
  },
  
  switchConversation: (id: string) => {
    const { conversations } = get();
    const conversation = conversations.find(conv => conv.id === id);
    
    if (conversation) {
      set({ 
        activeConversationId: id,
        messages: conversation.messages,
      });
    }
  },
  
  deleteConversation: (id: string) => {
    set(state => {
      const updatedConversations = state.conversations.filter(conv => conv.id !== id);
      const newActiveId = state.activeConversationId === id 
        ? (updatedConversations.length > 0 ? updatedConversations[0].id : null)
        : state.activeConversationId;
      
      return {
        conversations: updatedConversations,
        activeConversationId: newActiveId,
        messages: newActiveId 
          ? updatedConversations.find(conv => conv.id === newActiveId)?.messages || []
          : [],
      };
    });
  },
  
  clearMessages: () => {
    const { activeConversationId } = get();
    
    if (activeConversationId) {
      set(state => {
        const updatedConversations = state.conversations.map(conv => {
          if (conv.id === activeConversationId) {
            return { ...conv, messages: [], updatedAt: Date.now() };
          }
          return conv;
        });
        
        return {
          conversations: updatedConversations,
          messages: [],
        };
      });
    }
  },
  
  setError: (error: string | null) => {
    set({ error });
  },
}));

export default useChatStore;
