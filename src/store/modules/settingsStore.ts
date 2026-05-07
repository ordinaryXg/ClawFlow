// store/modules/settingsStore.ts
// 设置状态管理

import { create } from 'zustand';

export interface SettingsState {
  theme: 'light' | 'dark';
  language: 'zh' | 'en';
  autoStartGateway: boolean;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}

export interface SettingsActions {
  updateSettings: (settings: Partial<SettingsState>) => void;
  resetSettings: () => void;
}

export type SettingsStore = SettingsState & SettingsActions;

const DEFAULT_SETTINGS: SettingsState = {
  theme: 'light',
  language: 'zh',
  autoStartGateway: false,
  logLevel: 'info',
};

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  ...DEFAULT_SETTINGS,
  
  updateSettings: (settings) => {
    set({ ...get(), ...settings });
    
    // 保存到 localStorage
    try {
      localStorage.setItem('clawflow-settings', JSON.stringify({ ...get(), ...settings }));
    } catch (error) {
      console.error('保存设置失败:', error);
    }
  },
  
  resetSettings: () => {
    set(DEFAULT_SETTINGS);
    
    // 从 localStorage 移除
    try {
      localStorage.removeItem('clawflow-settings');
    } catch (error) {
      console.error('重置设置失败:', error);
    }
  },
}));

// 初始化时从 localStorage 加载设置
try {
  const savedSettings = localStorage.getItem('clawflow-settings');
  if (savedSettings) {
    const settings = JSON.parse(savedSettings);
    useSettingsStore.setState(settings);
  }
} catch (error) {
  console.error('加载设置失败:', error);
}

export default useSettingsStore;
