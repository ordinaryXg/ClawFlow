import { BrowserWindow } from 'electron';
import * as path from 'path';
import * as workspaceService from './workspace-service';
import { resolveWorkspaceRootForWebContents } from './electron-workspace-context';

export function broadcastSubAgentsUpdated(workspaceRoot: string): void {
  const resolved = path.resolve(workspaceRoot);
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed()) continue;
    try {
      const wc = win.webContents;
      if (workspaceService.isSameWorkspacePath(resolveWorkspaceRootForWebContents(wc), resolved)) {
        wc.send('subAgents:updated', { workspaceRoot: resolved });
      }
    } catch {
      /* ignore */
    }
  }
}
