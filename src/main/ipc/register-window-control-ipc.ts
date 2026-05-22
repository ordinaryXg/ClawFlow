import { app, BrowserWindow, ipcMain } from 'electron';
import { readMainUiPrefsFromDisk, saveMainUiPrefs, getMainUiPrefs } from '../shell/main-ui-prefs';
import { destroyAppTray, ensureAppTray } from '../shell/app-tray';
import { getAppLanguage } from '../application-menu';

let windowControlIpcRegistered = false;

export function registerWindowControlIpcOnce(): void {
  if (windowControlIpcRegistered) return;
  windowControlIpcRegistered = true;

  ipcMain.handle('window:minimize', (event) => BrowserWindow.fromWebContents(event.sender)?.minimize());
  ipcMain.handle('window:toggleMaximize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return;
    if (win.isMaximized()) win.unmaximize();
    else win.maximize();
  });
  ipcMain.handle('window:close', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win || win.isDestroyed()) return;
    const prefs = getMainUiPrefs();
    if (prefs.closeButtonAction === 'minimizeToTray') {
      win.hide();
      if (process.platform === 'win32' || process.platform === 'linux') {
        try {
          ensureAppTray(
            () => getAppLanguage(),
            () => {
              destroyAppTray();
              app.quit();
            }
          );
        } catch (e) {
          console.warn('[app-tray] ensure failed:', e);
        }
      }
      return;
    }
    win.close();
  });
  ipcMain.handle('window:reload', (event) => BrowserWindow.fromWebContents(event.sender)?.webContents.reload());
  ipcMain.handle('window:toggleDevTools', (event) => {
    const wc = BrowserWindow.fromWebContents(event.sender)?.webContents;
    if (!wc) return;
    if (wc.isDevToolsOpened()) wc.closeDevTools();
    else wc.openDevTools({ mode: 'detach' });
  });
  ipcMain.handle('window:undo', (event) => BrowserWindow.fromWebContents(event.sender)?.webContents.undo());
  ipcMain.handle('window:redo', (event) => BrowserWindow.fromWebContents(event.sender)?.webContents.redo());
  ipcMain.handle('window:cut', (event) => BrowserWindow.fromWebContents(event.sender)?.webContents.cut());
  ipcMain.handle('window:copy', (event) => BrowserWindow.fromWebContents(event.sender)?.webContents.copy());
  ipcMain.handle('window:paste', (event) => BrowserWindow.fromWebContents(event.sender)?.webContents.paste());
  ipcMain.handle('window:selectAll', (event) => BrowserWindow.fromWebContents(event.sender)?.webContents.selectAll());
  ipcMain.handle('app:syncMainUiPrefs', (_e, payload: unknown) => {
    const o = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
    const a = o.closeButtonAction === 'minimizeToTray' ? 'minimizeToTray' : 'quit';
    saveMainUiPrefs({ closeButtonAction: a });
    return { ok: true as const };
  });
  ipcMain.handle('app:quit', () => app.quit());
  ipcMain.handle('app:relaunch', () => {
    app.relaunch();
    app.exit(0);
  });
}

/** 启动时读入托盘/关闭按钮偏好（与 registerWindowControlIpcOnce 解耦，便于 index 在 whenReady 最早调用） */
export function loadMainUiPrefsOnStartup(): void {
  readMainUiPrefsFromDisk();
}
