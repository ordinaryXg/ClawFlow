import { BrowserWindow } from 'electron';

/** 工作区磁盘变更后通知渲染进程刷新文件树（全窗口广播，由渲染层按 activePath 过滤）。 */
export function broadcastWorkspaceFilesUpdated(workspaceRoot: string): void {
  const root = String(workspaceRoot ?? '').trim();
  if (!root) return;
  const payload = { workspaceRoot: root };
  for (const w of BrowserWindow.getAllWindows()) {
    try {
      if (!w.isDestroyed()) w.webContents.send('workspace-files:updated', payload);
    } catch {
      /* ignore */
    }
  }
}
