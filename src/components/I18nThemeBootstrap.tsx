import { FC, useEffect } from 'react';
import i18n from '../i18n';
import { useSettingsStore } from '../store/modules/settingsStore';
import { useWorkspaceStore } from '../store/modules/workspaceStore';
import { workspacePathsLikelyEqual } from '../utils/workspace-path';

/** 同步语言/主题/字号到 DOM 与 i18n，并把关闭按钮策略同步到主进程 */
export const I18nThemeBootstrap: FC = () => {
  const language = useSettingsStore((s) => s.language);
  const theme = useSettingsStore((s) => s.theme);
  const uiFontSize = useSettingsStore((s) => s.uiFontSize);
  const closeButtonAction = useSettingsStore((s) => s.closeButtonAction);

  useEffect(() => {
    void i18n.changeLanguage(language);
    void window.electronAPI?.setAppLanguage?.(language);
  }, [language]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    document.documentElement.dataset.cfFont = uiFontSize;
  }, [uiFontSize]);

  useEffect(() => {
    void window.electronAPI?.syncMainUiPrefs?.({ closeButtonAction });
  }, [closeButtonAction]);

  useEffect(() => {
    const off = window.electronAPI?.onWorkspaceFilesUpdated?.(({ workspaceRoot }) => {
      const active = useWorkspaceStore.getState().activePath;
      if (!active?.trim() || !workspacePathsLikelyEqual(workspaceRoot, active)) return;
      window.dispatchEvent(new CustomEvent('cf-workspace-files-updated'));
    });
    return () => off?.();
  }, []);

  return null;
};

export default I18nThemeBootstrap;
