import { FC, useEffect } from 'react';
import i18n from '../i18n';
import { useGatewayStore } from '../store/modules/gatewayStore';
import { useSettingsStore } from '../store/modules/settingsStore';

/**
 * 同步语言/主题到 DOM 与 i18n；启动时把持久化的 OpenClaw 路径与超时推送到主进程引擎。
 */
export const I18nThemeBootstrap: FC = () => {
  const language = useSettingsStore((s) => s.language);
  const theme = useSettingsStore((s) => s.theme);

  useEffect(() => {
    void i18n.changeLanguage(language);
  }, [language]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    const { openclawCliPath, commandTimeout } = useSettingsStore.getState();
    const path = openclawCliPath.trim();
    const payload: { cliPath?: string; commandTimeout: number } = { commandTimeout };
    if (path) payload.cliPath = path;

    if (!window.electronAPI?.updateConfig) return;

    void window.electronAPI
      .updateConfig(payload)
      .then(() => {
        useGatewayStore.getState().updateConfig({ cliPath: path || undefined, commandTimeout });
      })
      .catch(() => {
        /* 启动期同步失败不阻断 UI */
      });
  }, []);

  return null;
};

export default I18nThemeBootstrap;
