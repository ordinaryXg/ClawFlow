import { BrowserWindow } from 'electron';
import * as path from 'path';
import { resolveWorkspaceRootForWebContents } from '../electron-workspace-context';
import * as workspaceService from '../workspace/workspace-service';

/** 向「当前 WebContents 绑定同一工作区」的窗口发送 IPC 事件。 */
export function broadcastToWorkspaceWindows(workspaceRoot: string, channel: string, payload?: unknown): void {
  const resolved = path.resolve(workspaceRoot);
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed()) continue;
    try {
      const wc = win.webContents;
      const senderRoot = resolveWorkspaceRootForWebContents(wc);
      if (senderRoot && workspaceService.isSameWorkspacePath(senderRoot, resolved)) {
        if (payload === undefined) wc.send(channel);
        else wc.send(channel, payload);
      }
    } catch {
      /* ignore */
    }
  }
}
