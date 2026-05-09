import { ipcMain } from 'electron';
import http, { IncomingMessage, ServerResponse } from 'http';
import { EventEmitter } from 'events';
import WebSocket, { WebSocketServer } from 'ws';
import { getGlobalClawFlowEngine } from './clawflow-engine';

export type GatewayStatus = 'running' | 'stopped' | 'unknown';

export type GatewayEvents = {
  'gateway:started': [{ port: number }];
  'gateway:stopped': [];
  'gateway:error': [{ message: string }];
  'channel:message': [{ channelId: string; conversationId: string; text: string }];
};

type GatewayLogLevel = 'debug' | 'info' | 'warn' | 'error';
type GatewayLogEntry = { ts: number; level: GatewayLogLevel; msg: string };

type WsClientMessage =
  | {
      type: 'chat:send';
      requestId: string;
      conversationId: string;
      text: string;
      mode?: 'ask' | 'plan' | 'multitask';
      intent?: 'fast' | 'strong' | 'cheap';
      policyOverrides?: unknown;
      modelId?: string;
    }
  | { type: 'gateway:ping' }
  | { type: 'chat:cancel'; requestId: string };

type WsServerEvent =
  | { type: 'chat:ack'; requestId: string; conversationId: string }
  | { type: 'chat:delta'; requestId: string; conversationId: string; text: string }
  | { type: 'chat:final'; requestId: string; conversationId: string; message: string }
  | { type: 'gateway:log'; entry: GatewayLogEntry }
  | { type: 'gateway:status'; status: GatewayStatus; port: number; uptimeMs: number };

function readBody(req: IncomingMessage, limitBytes = 256 * 1024): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    req.on('data', (c: Buffer) => {
      total += c.length;
      if (total > limitBytes) {
        reject(new Error('Body too large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    req.on('error', reject);
  });
}

class GatewayDaemon extends EventEmitter {
  private server: http.Server | null = null;
  private wss: WebSocketServer | null = null;
  private clients = new Set<WebSocket>();
  private port = 18789;
  private startedAt = 0;
  private logs: GatewayLogEntry[] = [];
  private maxLogs = 260;
  private abortByRequestId = new Map<string, AbortController>();

  status(): GatewayStatus {
    if (!this.server) return 'stopped';
    return 'running';
  }

  getPort(): number {
    return this.port;
  }

  uptimeMs(): number {
    if (!this.server || !this.startedAt) return 0;
    return Math.max(0, Date.now() - this.startedAt);
  }

  getLogs(limit = 120): GatewayLogEntry[] {
    const n = Number.isFinite(limit) ? Math.max(1, Math.min(400, Math.floor(limit))) : 120;
    return this.logs.slice(-n);
  }

  private pushLog(level: GatewayLogLevel, msg: string) {
    const entry: GatewayLogEntry = { ts: Date.now(), level, msg: String(msg ?? '') };
    this.logs.push(entry);
    if (this.logs.length > this.maxLogs) this.logs = this.logs.slice(-this.maxLogs);
    this.broadcast({ type: 'gateway:log', entry });
  }

  private broadcast(ev: WsServerEvent) {
    const text = JSON.stringify(ev);
    for (const ws of this.clients) {
      if (ws.readyState !== WebSocket.OPEN) continue;
      try {
        ws.send(text);
      } catch {
        // ignore
      }
    }
  }

  private send(ws: WebSocket, ev: WsServerEvent) {
    if (ws.readyState !== WebSocket.OPEN) return;
    try {
      ws.send(JSON.stringify(ev));
    } catch {
      // ignore
    }
  }

  async restart(port?: number): Promise<void> {
    await this.stop();
    await this.start(port);
  }

  async start(port?: number): Promise<void> {
    if (this.server) return;
    const p = typeof port === 'number' && Number.isFinite(port) ? port : this.port;
    this.port = p;
    this.startedAt = Date.now();

    this.server = http.createServer(async (req: IncomingMessage, res: ServerResponse) => {
      try {
        const url = req.url || '/';
        if (req.method === 'GET' && url === '/health') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, status: this.status(), port: this.port }));
          return;
        }

        if (req.method === 'GET' && url === '/status') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              ok: true,
              status: this.status(),
              port: this.port,
              uptimeMs: this.uptimeMs(),
            })
          );
          return;
        }

        if (req.method === 'GET' && url.startsWith('/logs')) {
          const u = new URL(`http://127.0.0.1${url}`);
          const limitRaw = u.searchParams.get('limit') ?? '';
          const limit = limitRaw ? Number(limitRaw) : 120;
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, logs: this.getLogs(limit) }));
          return;
        }

        if (req.method === 'POST' && url === '/restart') {
          const raw = await readBody(req);
          const body = raw ? JSON.parse(raw) : {};
          const nextPort = typeof body?.port === 'number' ? body.port : undefined;
          await this.restart(nextPort);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, status: this.status(), port: this.port }));
          return;
        }

        // Legacy ingress: POST /message { text, conversationId?, mode?, modelId? }
        if (req.method === 'POST' && url === '/message') {
          const raw = await readBody(req);
          const body = raw ? JSON.parse(raw) : {};
          const text = String(body?.text ?? '').trim();
          if (!text) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: 'Missing text' }));
            return;
          }
          const conversationId = String(body?.conversationId ?? '').trim() || 'webhook-default';
          const mode = (String(body?.mode ?? '').trim().toLowerCase() || 'ask') as 'ask' | 'plan' | 'multitask';
          const modelId = typeof body?.modelId === 'string' ? body.modelId : undefined;

          this.emit('channel:message', { channelId: 'webhook', conversationId, text });
          this.pushLog('info', `[http] /message conv=${conversationId} mode=${mode} chars=${text.length}`);
          const out = await getGlobalClawFlowEngine().sendMessage({
            conversationId,
            userText: text,
            mode,
            ...(modelId ? { modelId } : {}),
          });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, message: out.message }));
          return;
        }

        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'Not found' }));
      } catch (e: any) {
        this.emit('gateway:error', { message: e?.message ?? String(e) });
        this.pushLog('error', e?.message ?? String(e));
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: e?.message ?? String(e) }));
      }
    });

    // WebSocket server (noServer) — upgraded from the HTTP server.
    this.wss = new WebSocketServer({ noServer: true });
    this.wss.on('connection', (ws, req) => {
      this.clients.add(ws);
      const origin = String((req?.headers as any)?.origin ?? '');
      this.pushLog('info', `[ws] client connected origin=${origin}`);
      this.send(ws, { type: 'gateway:status', status: this.status(), port: this.port, uptimeMs: this.uptimeMs() });
      for (const entry of this.getLogs(40)) {
        this.send(ws, { type: 'gateway:log', entry });
      }
      ws.on('close', () => this.clients.delete(ws));
      ws.on('message', (data) => void this.handleWsMessage(ws, data));
    });

    this.server.on('upgrade', (req, socket, head) => {
      try {
        const u = req.url || '/';
        // Browser WebSocket may include query string; accept `/ws` prefix.
        if (!u.startsWith('/ws')) {
          this.pushLog('warn', `[ws] upgrade rejected url=${u}`);
          socket.destroy();
          return;
        }
        if (!this.wss) {
          this.pushLog('warn', `[ws] upgrade rejected (wss missing) url=${u}`);
          socket.destroy();
          return;
        }
        const origin = String((req.headers as any)?.origin ?? '');
        this.pushLog('debug', `[ws] upgrade url=${u} origin=${origin}`);
        this.wss.handleUpgrade(req, socket, head, (ws) => {
          this.wss?.emit('connection', ws, req);
        });
      } catch {
        socket.destroy();
      }
    });

    // Windows 上端口占用比较常见（尤其 18789 可能与其他本地服务冲突），这里做有限次自增重试。
    const maxAttempts = 8;
    let lastErr: any = null;
    for (let i = 0; i < maxAttempts; i++) {
      const tryPort = this.port + i;
      try {
        await new Promise<void>((resolve, reject) => {
          const onErr = (err: any) => {
            this.server?.removeListener('error', onErr);
            reject(err);
          };
          this.server!.once('error', onErr);
          this.server!.listen(tryPort, '127.0.0.1', () => {
            this.server?.removeListener('error', onErr);
            resolve();
          });
        });
        this.port = tryPort;
        lastErr = null;
        break;
      } catch (e: any) {
        lastErr = e;
        const code = String(e?.code ?? '');
        if (code === 'EADDRINUSE') continue;
        throw e;
      }
    }
    if (lastErr) throw lastErr;
    this.pushLog('info', `GatewayDaemon started on 127.0.0.1:${this.port}`);
    this.emit('gateway:started', { port: this.port });
  }

  private async handleWsMessage(ws: WebSocket, raw: WebSocket.RawData) {
    let msg: WsClientMessage | null = null;
    try {
      const text = typeof raw === 'string' ? raw : raw.toString('utf-8');
      msg = JSON.parse(text) as WsClientMessage;
    } catch {
      this.send(ws, {
        type: 'gateway:log',
        entry: { ts: Date.now(), level: 'warn', msg: 'Invalid WS message (not JSON)' },
      });
      return;
    }
    if (!msg || typeof msg !== 'object' || typeof (msg as any).type !== 'string') return;

    if (msg.type === 'gateway:ping') {
      this.send(ws, { type: 'gateway:status', status: this.status(), port: this.port, uptimeMs: this.uptimeMs() });
      return;
    }
    if (msg.type === 'chat:cancel') {
      const id = String(msg.requestId ?? '').trim();
      const ctrl = id ? this.abortByRequestId.get(id) : null;
      if (ctrl) {
        try {
          ctrl.abort();
        } catch {
          // ignore
        }
        this.abortByRequestId.delete(id);
        this.pushLog('info', `[ws] chat:cancel id=${id}`);
      } else {
        this.pushLog('warn', `[ws] chat:cancel unknown id=${id}`);
      }
      return;
    }
    if (msg.type !== 'chat:send') return;

    const requestId = String(msg.requestId ?? '').trim();
    const conversationId = String(msg.conversationId ?? '').trim();
    const text = String(msg.text ?? '').trim();
    const mode = (String(msg.mode ?? 'ask').trim().toLowerCase() || 'ask') as 'ask' | 'plan' | 'multitask';
    const intent = (String((msg as any).intent ?? 'strong').trim().toLowerCase() || 'strong') as
      | 'fast'
      | 'strong'
      | 'cheap';
    const policyOverrides = (msg as any).policyOverrides;
    const modelId = typeof msg.modelId === 'string' ? msg.modelId.trim() : '';

    if (!requestId || !conversationId || !text) {
      this.send(ws, {
        type: 'gateway:log',
        entry: { ts: Date.now(), level: 'warn', msg: 'chat:send missing requestId/conversationId/text' },
      });
      return;
    }

    this.send(ws, { type: 'chat:ack', requestId, conversationId });
    this.pushLog(
      'info',
      `[ws] chat:send id=${requestId} conv=${conversationId} mode=${mode} intent=${intent} chars=${text.length}`
    );

    const abort = new AbortController();
    this.abortByRequestId.set(requestId, abort);

    const sendDelta = (d: string) => {
      if (abort.signal.aborted) return;
      const delta = String(d ?? '');
      if (!delta) return;
      this.send(ws, { type: 'chat:delta', requestId, conversationId, text: delta });
    };

    try {
      if (mode === 'multitask') {
        const out = await getGlobalClawFlowEngine().sendMessage({
          conversationId,
          userText: text,
          mode,
          ...(modelId ? { modelId } : {}),
          onDelta: sendDelta,
          abortSignal: abort.signal,
          intent,
          ...(policyOverrides ? { policyOverrides } : {}),
        });
        this.abortByRequestId.delete(requestId);
        this.send(ws, { type: 'chat:final', requestId, conversationId, message: out.message ?? '' });
        return;
      }

      const full = await getGlobalClawFlowEngine().sendMessageTextStream({
        conversationId,
        userText: text,
        mode: mode === 'plan' ? 'plan' : 'ask',
        ...(modelId ? { modelId } : {}),
        onDelta: sendDelta,
        abortSignal: abort.signal,
        intent,
        ...(policyOverrides ? { policyOverrides } : {}),
      });
      this.abortByRequestId.delete(requestId);
      this.send(ws, { type: 'chat:final', requestId, conversationId, message: full ?? '' });
    } catch (e: any) {
      const aborted = abort.signal.aborted || String(e?.message ?? e) === 'CANCELLED';
      this.abortByRequestId.delete(requestId);
      if (aborted) {
        sendDelta('\n[cancelled]\n');
        this.send(ws, { type: 'chat:final', requestId, conversationId, message: '' });
        return;
      }
      const msgText = e?.message ?? String(e);
      sendDelta(`\n[error] ${msgText}\n`);
      this.send(ws, { type: 'chat:final', requestId, conversationId, message: msgText });
      this.pushLog('error', `[ws] chat failed id=${requestId}: ${msgText}`);
    }
  }

  async stop(): Promise<void> {
    if (!this.server) return;
    const s = this.server;
    this.server = null;
    try {
      for (const ws of this.clients) {
        try {
          ws.close();
        } catch {
          // ignore
        }
      }
      this.clients.clear();
      this.wss?.close();
      this.wss = null;
    } catch {
      // ignore
    }
    await new Promise<void>((resolve) => s.close(() => resolve()));
    this.pushLog('info', 'GatewayDaemon stopped');
    this.emit('gateway:stopped', {});
  }
}

let globalGateway: GatewayDaemon | null = null;

export function getGatewayDaemon(): GatewayDaemon {
  if (!globalGateway) globalGateway = new GatewayDaemon();
  return globalGateway;
}

export function registerGatewayIPC(): void {
  ipcMain.handle('engineGateway:status', async () => {
    const g = getGatewayDaemon();
    return { status: g.status(), port: g.getPort(), uptimeMs: g.uptimeMs() };
  });
  ipcMain.handle('engineGateway:start', async (_e, params?: { port?: number }) => {
    await getGatewayDaemon().start(params?.port);
    return { success: true };
  });
  ipcMain.handle('engineGateway:stop', async () => {
    await getGatewayDaemon().stop();
    return { success: true };
  });
  ipcMain.handle('engineGateway:restart', async (_e, params?: { port?: number }) => {
    await getGatewayDaemon().restart(params?.port);
    return { success: true };
  });
  ipcMain.handle('engineGateway:logs', async (_e, params?: { limit?: number }) => {
    const g = getGatewayDaemon();
    return { logs: g.getLogs(params?.limit ?? 120) };
  });
}

