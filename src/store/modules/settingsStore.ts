// store/modules/settingsStore.ts
// 设置状态管理

import { create } from 'zustand';

export interface SettingsState {
  theme: 'light' | 'dark';
  language: 'zh' | 'en';
  autoStartGateway: boolean;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  /** 对话页默认选中的模型 ID（如 `deepseek/deepseek-chat`） */
  builtinDefaultModelId: string | null;
  /** 对话策略意图：更快/更强/更省钱 */
  chatIntent: 'fast' | 'strong' | 'cheap';
  /**
   * 模式策略覆盖（JSON 字符串）
   * 结构示例：
   * { "ask": { "thinking": {"type":"disabled"} }, "plan": { "reasoning_effort":"max" }, "multitask": { "toolsEnabled": true } }
   */
  chatModePolicyOverridesJson: string;
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
  builtinDefaultModelId: null,
  chatIntent: 'strong',
  chatModePolicyOverridesJson: '',
};

function persistSlice(state: SettingsState) {
  return {
    theme: state.theme,
    language: state.language,
    autoStartGateway: state.autoStartGateway,
    logLevel: state.logLevel,
    builtinDefaultModelId: state.builtinDefaultModelId,
    chatIntent: state.chatIntent,
    chatModePolicyOverridesJson: state.chatModePolicyOverridesJson,
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
      builtinDefaultModelId:
        typeof p.builtinDefaultModelId === 'string' && p.builtinDefaultModelId.trim()
          ? p.builtinDefaultModelId.trim()
          : null,
      chatIntent: ['fast', 'strong', 'cheap'].includes(String((p as any).chatIntent))
        ? ((p as any).chatIntent as any)
        : DEFAULT_SETTINGS.chatIntent,
      chatModePolicyOverridesJson:
        typeof (p as any).chatModePolicyOverridesJson === 'string' ? (p as any).chatModePolicyOverridesJson : '',
    });
  }
} catch (error) {
  console.error('加载设置失败:', error);
}

export default useSettingsStore;
