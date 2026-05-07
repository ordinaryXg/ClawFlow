// store/modules/gatewayStore.ts
// Gateway 状态管理

import { create } from 'zustand';

export interface GatewayState {
  status: 'running' | 'stopped' | 'unknown';
  version: string;
  isStarting: boolean;
  isStopping: boolean;
  error: string | null;
  config: {
    cliPath?: string;
    commandTimeout?: number;
    gatewayStartTimeout?: number;
    verbose?: boolean;
  };
  
  // Actions
  fetchStatus: () => Promise<void>;
  startGateway: () => Promise<void>;
  stopGateway: () => Promise<void>;
  fetchVersion: () => Promise<void>;
  updateConfig: (config: Partial<GatewayState['config']>) => void;
  setStatus: (status: GatewayState['status']) => void;
  setError: (error: string | null) => void;
}

export const useGatewayStore = create<GatewayState>((set, get) => ({
  status: 'unknown',
  version: '',
  isStarting: false,
  isStopping: false,
  error: null,
  config: {
    cliPath: undefined,
    commandTimeout: 60000,
    gatewayStartTimeout: 30000,
    verbose: true,
  },
  
  fetchStatus: async () => {
    try {
      const status = await window.electronAPI?.getGatewayStatus() as 'running' | 'stopped' | 'unknown';
      set({ status, error: null });
    } catch (error: any) {
      set({ error: error.message || '获取 Gateway 状态失败' });
    }
  },
  
  startGateway: async () => {
    set({ isStarting: true, error: null });
    try {
      await window.electronAPI?.startGateway();
      set({ status: 'running', isStarting: false });
    } catch (error: any) {
      set({ 
        error: error.message || '启动 Gateway 失败',
        isStarting: false 
      });
      throw error;
    }
  },
  
  stopGateway: async () => {
    set({ isStopping: true, error: null });
    try {
      await window.electronAPI?.stopGateway();
      set({ status: 'stopped', isStopping: false });
    } catch (error: any) {
      set({ 
        error: error.message || '停止 Gateway 失败',
        isStopping: false 
      });
      throw error;
    }
  },
  
  fetchVersion: async () => {
    try {
      const version = await window.electronAPI?.getVersion();
      set({ version, error: null });
    } catch (error: any) {
      set({ error: error.message || '获取版本失败' });
    }
  },
  
  updateConfig: (config) => {
    set(state => ({ 
      config: { ...state.config, ...config } 
    }));
  },
  
  setStatus: (status) => {
    set({ status });
  },
  
  setError: (error) => {
    set({ error });
  },
}));

export default useGatewayStore;
