import { FC, useEffect } from 'react';
import i18n from '../i18n';
import { useSettingsStore } from '../store/modules/settingsStore';

/** 同步语言/主题到 DOM 与 i18n */
export const I18nThemeBootstrap: FC = () => {
  const language = useSettingsStore((s) => s.language);
  const theme = useSettingsStore((s) => s.theme);

  useEffect(() => {
    void i18n.changeLanguage(language);
    void window.electronAPI?.setAppLanguage?.(language);
  }, [language]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  return null;
};

export default I18nThemeBootstrap;
