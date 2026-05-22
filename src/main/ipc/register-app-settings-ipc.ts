import { app, ipcMain } from 'electron';
import { setAppLanguageFromRenderer } from '../application-menu';
import {
  getDefaultAppCacheRootSync,
  getEffectiveAppCacheRootSync,
  readAppCachePrefsFile,
} from '../prefs/app-cache-prefs';
import { setAppCacheRootAndMigrate } from '../workspace/workspace-blob-store';
import { replaceIpcHandler } from './ipc-handler-utils';

/** 应用版本 / 缓存根 / 语言：在 app.whenReady 内、引擎 IPC 注册后调用 */
export function registerAppSettingsIPC(): void {
  replaceIpcHandler('app:getVersion', () => app.getVersion());
  replaceIpcHandler('app:getAppCacheSettings', () => {
    const prefs = readAppCachePrefsFile();
    const configured =
      typeof prefs.cacheRoot === 'string' && prefs.cacheRoot.trim() ? prefs.cacheRoot.trim() : null;
    return {
      effectiveRoot: getEffectiveAppCacheRootSync(),
      defaultRoot: getDefaultAppCacheRootSync(),
      configuredRoot: configured,
    };
  });
  replaceIpcHandler('app:setAppCacheRoot', async (_e, folderPath: string | null | undefined) =>
    setAppCacheRootAndMigrate(folderPath ?? null)
  );
  ipcMain.handle('app:setLanguage', (_event, lang: string) => {
    setAppLanguageFromRenderer(lang);
    return { success: true };
  });
}
