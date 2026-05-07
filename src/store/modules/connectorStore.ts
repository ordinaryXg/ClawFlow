// store/modules/connectorStore.ts
// 连接器状态管理

import { create } from 'zustand';

export interface ConnectorConfig {
  name: string;
  type: string;
  config: Record<string, any>;
}

export interface Connector {
  id: string;
  name: string;
  type: string;
  config: Record<string, any>;
  status: 'connected' | 'disconnected' | 'error';
  createdAt: number;
  updatedAt: number;
}

export interface ConnectorState {
  connectors: Connector[];
  isLoading: boolean;
  error: string | null;
  
  // Actions
  fetchConnectors: () => Promise<void>;
  addConnector: (config: ConnectorConfig) => Promise<void>;
  updateConnector: (id: string, config: Partial<ConnectorConfig>) => Promise<void>;
  deleteConnector: (id: string) => Promise<void>;
  testConnection: (id: string) => Promise<boolean>;
  setError: (error: string | null) => void;
}

export const useConnectorStore = create<ConnectorState>((set, get) => ({
  connectors: [],
  isLoading: false,
  error: null,
  
  fetchConnectors: async () => {
    set({ isLoading: true, error: null });
    try {
      // TODO: 调用 OpenClaw API 获取连接器列表
      // const connectors = await window.electronAPI?.getConnectors();
      
      // 模拟数据
      const mockConnectors: Connector[] = [
        {
          id: '1',
          name: 'GitHub',
          type: 'github',
          config: { token: '***' },
          status: 'connected',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ];
      
      set({ 
        connectors: mockConnectors,
        isLoading: false 
      });
    } catch (error: any) {
      set({ 
        error: error.message || '获取连接器列表失败',
        isLoading: false 
      });
    }
  },
  
  addConnector: async (config: ConnectorConfig) => {
    set({ isLoading: true, error: null });
    try {
      // TODO: 调用 OpenClaw API 添加连接器
      // await window.electronAPI?.addConnector(config);
      
      const newConnector: Connector = {
        id: Date.now().toString(),
        name: config.name,
        type: config.type,
        config: config.config,
        status: 'disconnected',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      
      set(state => ({ 
        connectors: [...state.connectors, newConnector],
        isLoading: false 
      }));
    } catch (error: any) {
      set({ 
        error: error.message || '添加连接器失败',
        isLoading: false 
      });
      throw error;
    }
  },
  
  updateConnector: async (id: string, config: Partial<ConnectorConfig>) => {
    set({ isLoading: true, error: null });
    try {
      // TODO: 调用 OpenClaw API 更新连接器
      // await window.electronAPI?.updateConnector(id, config);
      
      set(state => ({ 
        connectors: state.connectors.map(connector => 
          connector.id === id 
            ? { ...connector, ...config, updatedAt: Date.now() }
            : connector
        ),
        isLoading: false 
      }));
    } catch (error: any) {
      set({ 
        error: error.message || '更新连接器失败',
        isLoading: false 
      });
      throw error;
    }
  },
  
  deleteConnector: async (id: string) => {
    set({ isLoading: true, error: null });
    try {
      // TODO: 调用 OpenClaw API 删除连接器
      // await window.electronAPI?.deleteConnector(id);
      
      set(state => ({ 
        connectors: state.connectors.filter(connector => connector.id !== id),
        isLoading: false 
      }));
    } catch (error: any) {
      set({ 
        error: error.message || '删除连接器失败',
        isLoading: false 
      });
      throw error;
    }
  },
  
  testConnection: async (id: string) => {
    set({ error: null });
    try {
      // TODO: 调用 OpenClaw API 测试连接
      // const result = await window.electronAPI?.testConnector(id);
      
      // 模拟测试结果
      const success = true;
      
      set(state => ({ 
        connectors: state.connectors.map(connector => 
          connector.id === id 
            ? { ...connector, status: success ? 'connected' : 'error' as 'connected' | 'disconnected' | 'error' }
            : connector
        ),
      }));
      
      return success;
    } catch (error: any) {
      set({ 
        error: error.message || '测试连接失败' 
      });
      return false;
    }
  },
  
  setError: (error: string | null) => {
    set({ error });
  },
}));

export default useConnectorStore;
