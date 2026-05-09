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

type ConnectorAPIResponse =
  | { connectors?: Connector[] }
  | Connector[]
  | null
  | undefined;

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
      const res: ConnectorAPIResponse = await window.electronAPI?.getConnectors?.();
      const fromRes =
        Array.isArray(res) ? res : Array.isArray(res?.connectors) ? res?.connectors : null;
      
      set({
        connectors: Array.isArray(fromRes) ? fromRes : [],
        isLoading: false,
      });
    } catch (error: any) {
      set({
        connectors: [],
        error: error.message || '获取连接器列表失败',
        isLoading: false,
      });
    }
  },
  
  addConnector: async (config: ConnectorConfig) => {
    set({ isLoading: true, error: null });
    try {
      await window.electronAPI?.addConnector?.(config);
      await get().fetchConnectors();
      set({ isLoading: false });
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
      await window.electronAPI?.updateConnector?.(id, config);
      await get().fetchConnectors();
      set({ isLoading: false });
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
      await window.electronAPI?.deleteConnector?.(id);
      await get().fetchConnectors();
      set({ isLoading: false });
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
      const result = await window.electronAPI?.testConnector?.(id);
      const success = !!(typeof result === 'object' ? (result as any)?.success : result);
      
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
