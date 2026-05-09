// store/modules/gatewayStore.ts
// Gateway 状态管理

import { create } from 'zustand';

export interface GatewayState {
  status: 'running' | 'stopped' | 'unknown';
  isStarting: boolean;
  isStopping: boolean;
  error: string | null;
  port: number | null;
  uptimeMs: number;
  logs: Array<{ ts: number; level: string; msg: string }>;
  // Actions
  fetchStatus: () => Promise<void>;
  startGateway: () => Promise<void>;
  stopGateway: () => Promise<void>;
  restartGateway: () => Promise<void>;
  fetchLogs: (limit?: number) => Promise<void>;
  setStatus: (status: GatewayState['status']) => void;
  setError: (error: string | null) => void;
}

export const useGatewayStore = create<GatewayState>((set, get) => ({
  status: 'unknown',
  isStarting: false,
  isStopping: false,
  error: null,
  port: null,
  uptimeMs: 0,
  logs: [],
  fetchStatus: async () => {
    try {
      const res = await window.electronAPI?.engineGatewayStatus?.();
      const status = (res?.status as any) as 'running' | 'stopped' | 'unknown';
      set({
        status: status || 'unknown',
        port: typeof res?.port === 'number' ? res.port : null,
        uptimeMs: typeof res?.uptimeMs === 'number' ? res.uptimeMs : 0,
        error: null,
      });
    } catch (error: any) {
      set({ error: error.message || '获取 Gateway 状态失败' });
    }
  },
  
  startGateway: async () => {
    set({ isStarting: true, error: null });
    try {
      await window.electronAPI?.engineGatewayStart?.();
      const res = await window.electronAPI?.engineGatewayStatus?.();
      set({
        status: 'running',
        port: typeof res?.port === 'number' ? res.port : null,
        uptimeMs: typeof res?.uptimeMs === 'number' ? res.uptimeMs : 0,
        isStarting: false,
      });
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
      await window.electronAPI?.engineGatewayStop?.();
      set({ status: 'stopped', isStopping: false, uptimeMs: 0 });
    } catch (error: any) {
      set({ 
        error: error.message || '停止 Gateway 失败',
        isStopping: false 
      });
      throw error;
    }
  },

  restartGateway: async () => {
    set({ isStarting: true, error: null });
    try {
      await window.electronAPI?.engineGatewayRestart?.();
      const res = await window.electronAPI?.engineGatewayStatus?.();
      set({
        status: 'running',
        port: typeof res?.port === 'number' ? res.port : null,
        uptimeMs: typeof res?.uptimeMs === 'number' ? res.uptimeMs : 0,
        isStarting: false,
      });
    } catch (error: any) {
      set({ error: error.message || '重启 Gateway 失败', isStarting: false });
      throw error;
    }
  },

  fetchLogs: async (limit = 120) => {
    try {
      const res = await window.electronAPI?.engineGatewayGetLogs?.({ limit });
      set({ logs: Array.isArray(res?.logs) ? res.logs : [], error: null });
    } catch (error: any) {
      set({ error: error.message || '获取 Gateway 日志失败' });
    }
  },
  setStatus: (status) => {
    set({ status });
  },
  
  setError: (error) => {
    set({ error });
  },
}));

export default useGatewayStore;
