/**
 * 内置 Gateway WebSocket 客户端（渲染进程）。
 * 主路径聊天走 WS；`engine:sendMessage` 仅作非 Electron / 无 Gateway 时的回退（见根目录 README.md「聊天传输」）。
 */

export type GatewayWsEvent =
  | { type: 'chat:ack'; requestId: string; conversationId: string }
  | { type: 'chat:delta'; requestId: string; conversationId: string; text: string }
  | { type: 'chat:final'; requestId: string; conversationId: string; message: string }
  | {
      type: 'chat:toolApproval';
      requestId: string;
      conversationId: string;
      approvalId: string;
      tools: Array<{ name: string; argumentsPreview: string }>;
      riskLevel?: 'medium' | 'high';
      timeoutMs?: number;
      defaultApproved?: boolean;
    }
  | { type: 'gateway:log'; entry: { ts: number; level: string; msg: string } }
  | { type: 'gateway:status'; status: string; port: number; uptimeMs: number };

export type GatewayWsSend =
  | {
      type: 'chat:send';
      requestId: string;
      conversationId: string;
      text: string;
      mode: 'ask' | 'plan' | 'multitask';
      autoPick?: {
        pickedMode: 'ask' | 'plan' | 'multitask';
        reason: string;
        category?: string;
        categoryLabel?: string;
      };
      policyOverrides?: unknown;
      modelId?: string;
      workspaceRoot?: string;
    }
  | { type: 'gateway:ping' }
  | { type: 'chat:cancel'; requestId: string }
  | { type: 'chat:toolApprovalResponse'; requestId: string; approvalId: string; approved: boolean };

type Pending = {
  conversationId: string;
  onDelta: (text: string) => void;
  onFinal: (full: string) => void;
};

let wsClient: WebSocket | null = null;
let wsConnecting: Promise<WebSocket> | null = null;
const pendingById = new Map<string, Pending>();
const activeRequestByConversation = new Map<string, string>();

let onToolApproval: (payload: Extract<GatewayWsEvent, { type: 'chat:toolApproval' }>) => void = () => undefined;
let onToolApprovalCleared: (requestId: string) => void = () => undefined;

export function wireChatGatewayHandlers(handlers: {
  onToolApproval: (payload: Extract<GatewayWsEvent, { type: 'chat:toolApproval' }>) => void;
  onToolApprovalCleared: (requestId: string) => void;
}): void {
  onToolApproval = handlers.onToolApproval;
  onToolApprovalCleared = handlers.onToolApprovalCleared;
}

export function cancelOutboundWsForConversation(sessionId: string): void {
  const prevId = activeRequestByConversation.get(sessionId);
  if (!prevId) return;
  try {
    if (wsClient?.readyState === WebSocket.OPEN) {
      wsClient.send(JSON.stringify({ type: 'chat:cancel', requestId: prevId }));
    }
  } catch {
    /* ignore */
  }
  pendingById.delete(prevId);
  onToolApprovalCleared(prevId);
  activeRequestByConversation.delete(sessionId);
}

export function registerGatewayPendingRequest(
  sessionId: string,
  requestId: string,
  pending: Pending
): void {
  cancelOutboundWsForConversation(sessionId);
  pendingById.set(requestId, pending);
  activeRequestByConversation.set(sessionId, requestId);
}

export async function ensureGatewayWs(): Promise<WebSocket> {
  if (wsClient && wsClient.readyState === WebSocket.OPEN) return wsClient;
  if (wsConnecting) return wsConnecting;

  wsConnecting = (async () => {
    const api = window.electronAPI;
    if (!api?.engineGatewayStart || !api?.engineGatewayStatus) {
      throw new Error('Gateway 仅在 Electron 应用内可用（缺少 engineGateway IPC）。');
    }

    try {
      await api.engineGatewayStart();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(`启动 Gateway 失败: ${msg}`);
    }

    let port: number | undefined;
    for (let i = 0; i < 25; i++) {
      const st = await api.engineGatewayStatus();
      if (st?.status === 'running' && typeof st.port === 'number' && st.port > 0) {
        port = st.port;
        break;
      }
      await new Promise((r) => setTimeout(r, 60));
    }
    if (port == null) {
      const st = await api.engineGatewayStatus();
      throw new Error(
        `Gateway 未在本地监听（状态: ${String(st?.status ?? 'unknown')}）。请在「设置」中启动或重启 Gateway，并确认 127.0.0.1 端口未被占用。`
      );
    }

    const url = `ws://127.0.0.1:${port}/ws`;
    const ws = await new Promise<WebSocket>((resolve, reject) => {
      const sock = new WebSocket(url);
      const onOpen = () => {
        cleanup();
        resolve(sock);
      };
      const onError = () => {
        cleanup();
        reject(new Error(`Gateway WebSocket connect failed (${url})`));
      };
      const cleanup = () => {
        sock.removeEventListener('open', onOpen);
        sock.removeEventListener('error', onError);
      };
      sock.addEventListener('open', onOpen);
      sock.addEventListener('error', onError);
    });

    ws.addEventListener('message', (ev) => {
      let payload: GatewayWsEvent | null = null;
      try {
        payload = JSON.parse(String((ev as MessageEvent).data ?? '')) as GatewayWsEvent;
      } catch {
        return;
      }
      if (!payload || typeof payload !== 'object') return;
      if (payload.type === 'gateway:log') return;

      if (payload.type === 'chat:toolApproval') {
        onToolApproval(payload);
        return;
      }
      if (payload.type === 'chat:delta') {
        const p = pendingById.get(payload.requestId);
        if (!p || p.conversationId !== payload.conversationId) return;
        p.onDelta(String(payload.text ?? ''));
        return;
      }
      if (payload.type === 'chat:final') {
        onToolApprovalCleared(payload.requestId);
        const p = pendingById.get(payload.requestId);
        if (!p || p.conversationId !== payload.conversationId) return;
        pendingById.delete(payload.requestId);
        p.onFinal(String(payload.message ?? ''));
      }
    });

    ws.addEventListener('close', () => {
      wsClient = null;
      wsConnecting = null;
    });

    wsClient = ws;
    wsConnecting = null;
    return ws;
  })();

  try {
    return await wsConnecting;
  } catch (e) {
    wsClient = null;
    wsConnecting = null;
    throw e;
  }
}

/** Electron 桌面端且具备 Gateway IPC 时走 WS 主路径 */
export function shouldUseGatewayChatTransport(): boolean {
  return (
    typeof WebSocket !== 'undefined' &&
    typeof window.electronAPI?.engineGatewayStatus === 'function' &&
    typeof window.electronAPI?.engineGatewayStart === 'function'
  );
}

export async function sendGatewayChatMessage(msg: GatewayWsSend): Promise<void> {
  const ws = await ensureGatewayWs();
  ws.send(JSON.stringify(msg));
}
