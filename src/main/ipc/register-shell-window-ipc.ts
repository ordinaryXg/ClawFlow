import { BrowserWindow, screen } from 'electron';
import { replaceIpcHandler } from './ipc-handler-utils';

/** 便签紧凑窗口：按 BrowserWindow 分别保存 bounds，支持多窗口 */
type ShellCompactState = { restoreBounds: Electron.Rectangle; restoreMaximized: boolean };
const shellCompactByWindowId = new Map<number, ShellCompactState>();

/** 主进程一加载即注册，避免 whenReady 内前置 await 未完成时渲染进程已发起 invoke */
export function registerShellViewWindowIPC(): void {
  replaceIpcHandler('window:setShellViewAppearance', (_event, params: { compact?: boolean }) => {
    const win = BrowserWindow.fromWebContents(_event.sender);
    if (!win || win.isDestroyed()) return { ok: false as const, error: 'no_window' };
    const wantCompact = Boolean(params?.compact);

    if (wantCompact) {
      if (!shellCompactByWindowId.has(win.id)) {
        const restoreMaximized = win.isMaximized();
        if (restoreMaximized) win.unmaximize();
        const restoreBounds = win.getBounds();
        shellCompactByWindowId.set(win.id, { restoreBounds, restoreMaximized });
      }
      const wa = screen.getDisplayMatching(win.getBounds()).workArea;
      const width = Math.max(380, Math.floor(wa.width * 0.32));
      const marginTop = 10;
      const marginBottom = 18;
      const height = Math.max(420, wa.height - marginTop - marginBottom);
      const x = wa.x + wa.width - width;
      const y = wa.y + marginTop;
      win.setMinimumSize(300, 320);
      win.setBounds({ x, y, width, height }, true);
      return { ok: true as const };
    }

    const st = shellCompactByWindowId.get(win.id);
    if (st) {
      shellCompactByWindowId.delete(win.id);
      try {
        win.setMinimumSize(0, 0);
      } catch {
        /* ignore */
      }
      win.setBounds(st.restoreBounds, true);
      if (st.restoreMaximized) win.maximize();
    }
    return { ok: true as const };
  });
}
