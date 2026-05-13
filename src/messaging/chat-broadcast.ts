import { BrowserWindow } from 'electron';

/** 主进程写入会话后通知各渲染进程重新拉取 conversations；可带 workspaceRoot 以便仅匹配工作区的窗口刷新 */
export function broadcastChatConversationsDirty(payload?: { workspaceRoot?: string }): void {
  const body = payload && typeof payload.workspaceRoot === 'string' && payload.workspaceRoot.trim()
    ? { workspaceRoot: payload.workspaceRoot.trim() }
    : {};
  for (const w of BrowserWindow.getAllWindows()) {
    try {
      if (!w.isDestroyed()) w.webContents.send('chat:conversationsDirty', body);
    } catch {
      /* ignore */
    }
  }
}