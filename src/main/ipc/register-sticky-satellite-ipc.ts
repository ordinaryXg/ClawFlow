import { BrowserWindow } from 'electron';
import * as path from 'path';
import * as workspaceService from '../workspace/workspace-service';
import { stickySatellitePathByWindowId } from '../sticky-satellite-windows';
import { replaceIpcHandler } from './ipc-handler-utils';

export type StickySatelliteIpcHost = {
  buildBrowserWindow: () => BrowserWindow;
  mainWindowWebpackEntry: string;
  registerWindowControlIpcOnce: () => void;
  bumpMainShellWorkspaceIfSameAsSatelliteBinding: (detachedResolved: string) => void;
  broadcastStickyDetachedPaths: () => void;
};

export function registerStickySatelliteIPC(host: StickySatelliteIpcHost): void {
  replaceIpcHandler('sticky:getBootstrap', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return { role: 'main' as const, satelliteWorkspace: null as string | null };
    const p = stickySatellitePathByWindowId.get(win.id) ?? null;
    return { role: p ? ('satellite' as const) : ('main' as const), satelliteWorkspace: p };
  });

  replaceIpcHandler('sticky:getDetachedPaths', () => ({
    paths: [...new Set(stickySatellitePathByWindowId.values())],
  }));

  replaceIpcHandler('sticky:openSatellite', async (_event, params: { workspacePath?: string }) => {
    const raw = String(params?.workspacePath ?? '').trim();
    if (!raw) return { ok: false as const, error: 'missing_path' };
    const resolved = path.resolve(raw);
    for (const w of BrowserWindow.getAllWindows()) {
      if (w.isDestroyed()) continue;
      const p = stickySatellitePathByWindowId.get(w.id);
      if (p && workspaceService.isSameWorkspacePath(p, resolved)) {
        host.bumpMainShellWorkspaceIfSameAsSatelliteBinding(resolved);
        w.focus();
        return { ok: true as const, focused: true as const };
      }
    }
    host.registerWindowControlIpcOnce();
    const win = host.buildBrowserWindow();
    stickySatellitePathByWindowId.set(win.id, resolved);
    win.on('closed', () => {
      stickySatellitePathByWindowId.delete(win.id);
      host.broadcastStickyDetachedPaths();
    });
    win.loadURL(host.mainWindowWebpackEntry);
    win.once('ready-to-show', () => {
      try {
        win.show();
        win.focus();
      } catch {
        /* ignore */
      }
    });
    host.broadcastStickyDetachedPaths();
    host.bumpMainShellWorkspaceIfSameAsSatelliteBinding(resolved);
    return { ok: true as const, focused: false as const };
  });

  replaceIpcHandler('sticky:mergeSatellite', async (_event, params: { workspacePath?: string }) => {
    const raw = String(params?.workspacePath ?? '').trim();
    if (!raw) return { ok: false as const, error: 'missing_path' };
    const resolved = path.resolve(raw);
    const hit = [...stickySatellitePathByWindowId.entries()].find(([, p]) =>
      workspaceService.isSameWorkspacePath(p, resolved)
    );
    if (!hit) return { ok: true as const, closed: false as const };
    const [winId] = hit;
    const win = BrowserWindow.getAllWindows().find((w) => w.id === winId && !w.isDestroyed());
    win?.close();
    return { ok: true as const, closed: true as const };
  });
}
