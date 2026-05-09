// store/modules/settingsStore.ts
// 设置状态管理

import { create } from 'zustand';

export interface SettingsState {
  theme: 'light' | 'dark';
  language: 'zh' | 'en';
  autoStartGateway: boolean;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  /** OpenClaw 可执行文件路径，空字符串表示使用内置/PATH 解析 */
  openclawCliPath: string;
  /** 主进程命令超时（毫秒） */
  commandTimeout: number;
}

export interface SettingsActions {
  updateSettings: (settings: Partial<SettingsState>) => void;
  resetSettings: () => void;
}

export type SettingsStore = SettingsState & SettingsActions;

const DEFAULT_SETTINGS: SettingsState = {
  theme: 'dark',
  language: 'zh',
  autoStartGateway: true,
  logLevel: 'info',
  openclawCliPath: '',
  commandTimeout: 60000,
};

function persistSlice(state: SettingsState) {
  return {
    theme: state.theme,
    language: state.language,
    autoStartGateway: state.autoStartGateway,
    logLevel: state.logLevel,
    openclawCliPath: state.openclawCliPath,
    commandTimeout: state.commandTimeout,
  };
}

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  ...DEFAULT_SETTINGS,

  updateSettings: (settings) => {
    set((prev) => ({ ...prev, ...settings }));
    try {
      localStorage.setItem('clawflow-settings', JSON.stringify(persistSlice(get())));
    } catch (error) {
      console.error('保存设置失败:', error);
    }
  },

  resetSettings: () => {
    set(DEFAULT_SETTINGS);
    try {
      localStorage.removeItem('clawflow-settings');
    } catch (error) {
      console.error('重置设置失败:', error);
    }
  },
}));

try {
  const savedSettings = localStorage.getItem('clawflow-settings');
  if (savedSettings) {
    const p = JSON.parse(savedSettings) as Partial<SettingsState>;
    useSettingsStore.setState({
      theme: p.theme === 'light' ? 'light' : 'dark',
      language: p.language === 'en' ? 'en' : 'zh',
      autoStartGateway:
        typeof p.autoStartGateway === 'boolean' ? p.autoStartGateway : DEFAULT_SETTINGS.autoStartGateway,
      logLevel: ['debug', 'info', 'warn', 'error'].includes(String(p.logLevel))
        ? (p.logLevel as SettingsState['logLevel'])
        : 'info',
      openclawCliPath: typeof p.openclawCliPath === 'string' ? p.openclawCliPath : '',
      commandTimeout:
        typeof p.commandTimeout === 'number' && Number.isFinite(p.commandTimeout)
          ? p.commandTimeout
          : DEFAULT_SETTINGS.commandTimeout,
    });
  }
} catch (error) {
  console.error('加载设置失败:', error);
}

export default useSettingsStore;
