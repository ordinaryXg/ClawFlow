// store/modules/settingsStore.ts
// 设置状态管理

import { create } from 'zustand';

export type CloseButtonAction = 'quit' | 'minimizeToTray';
export type UiFontSizePreset = 'sm' | 'md' | 'lg' | 'xl';

export interface SettingsState {
  theme: 'light' | 'dark';
  language: 'zh' | 'en';
  autoStartGateway: boolean;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  /** 标题栏 ❌：退出应用 / 最小化到系统托盘（Windows/Linux 托盘；macOS 为隐藏窗口） */
  closeButtonAction: CloseButtonAction;
  /** 界面基础字号档位 */
  uiFontSize: UiFontSizePreset;
  /** 对话页默认选中的模型 ID（如 `deepseek/deepseek-chat`） */
  builtinDefaultModelId: string | null;
  /**
   * 模式策略覆盖（JSON 字符串）
   * 结构示例：
   * { "ask": { "thinking": {"type":"disabled"} }, "plan": { "toolsEnabled": false }, "multitask": { "toolsEnabled": false } }
   * （三种模式默认均开启工具；需关闭时设 toolsEnabled: false）
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
  closeButtonAction: 'quit',
  uiFontSize: 'md',
  builtinDefaultModelId: null,
  chatModePolicyOverridesJson: '',
};

function persistSlice(state: SettingsState) {
  return {
    theme: state.theme,
    language: state.language,
    autoStartGateway: state.autoStartGateway,
    logLevel: state.logLevel,
    closeButtonAction: state.closeButtonAction,
    uiFontSize: state.uiFontSize,
    builtinDefaultModelId: state.builtinDefaultModelId,
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
      closeButtonAction:
        p.closeButtonAction === 'minimizeToTray' ? 'minimizeToTray' : DEFAULT_SETTINGS.closeButtonAction,
      uiFontSize: ['sm', 'md', 'lg', 'xl'].includes(String((p as any).uiFontSize))
        ? ((p as any).uiFontSize as UiFontSizePreset)
        : DEFAULT_SETTINGS.uiFontSize,
      builtinDefaultModelId:
        typeof p.builtinDefaultModelId === 'string' && p.builtinDefaultModelId.trim()
          ? p.builtinDefaultModelId.trim()
          : null,
      chatModePolicyOverridesJson:
        typeof (p as any).chatModePolicyOverridesJson === 'string' ? (p as any).chatModePolicyOverridesJson : '',
    });
  }
} catch (error) {
  console.error('加载设置失败:', error);
}

export default useSettingsStore;
