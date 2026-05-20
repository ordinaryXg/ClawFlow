import { BrowserWindow } from 'electron';

/** 主进程写入会话后通知各渲染进程重新拉取 conversations；可带 workspaceRoot 以便仅匹配工作区的窗口刷新 */
export function broadcastChatConversationsDirty(payload?: { workspaceRoot?: string }): void {
  const body =
    payload && typeof payload.workspaceRoot === 'string' && payload.workspaceRoot.trim()
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

export type ChatEvolutionWireMessage = {
  id: string;
  role: 'assistant';
  content: string;
  timestamp: number;
  channel: 'assistant_evolution';
  meta?: Record<string, unknown>;
};

/** 增量推送进化卡片（避免全量 fetchConversations 延迟） */
export function broadcastChatEvolutionUpdate(payload: {
  workspaceRoot: string;
  conversationId: string;
  kind: 'append' | 'patch';
  message: ChatEvolutionWireMessage;
}): void {
  const body = {
    workspaceRoot: String(payload.workspaceRoot ?? '').trim(),
    conversationId: String(payload.conversationId ?? '').trim(),
    kind: payload.kind,
    message: payload.message,
  };
  if (!body.workspaceRoot || !body.conversationId || !body.message?.id) return;
  for (const w of BrowserWindow.getAllWindows()) {
    try {
      if (!w.isDestroyed()) w.webContents.send('chat:evolutionUpdate', body);
    } catch {
      /* ignore */
    }
  }
}
