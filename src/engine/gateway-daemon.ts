import { ipcMain } from 'electron';
import http, { IncomingMessage, ServerResponse } from 'http';
import { EventEmitter } from 'events';
import { getGlobalClawFlowEngine } from './clawflow-engine';

export type GatewayStatus = 'running' | 'stopped' | 'unknown';

export type GatewayEvents = {
  'gateway:started': [{ port: number }];
  'gateway:stopped': [];
  'gateway:error': [{ message: string }];
  'channel:message': [{ channelId: string; conversationId: string; text: string }];
};

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
  private port = 18789;

  status(): GatewayStatus {
    if (!this.server) return 'stopped';
    return 'running';
  }

  getPort(): number {
    return this.port;
  }

  async start(port?: number): Promise<void> {
    if (this.server) return;
    const p = typeof port === 'number' && Number.isFinite(port) ? port : this.port;
    this.port = p;

    this.server = http.createServer(async (req: IncomingMessage, res: ServerResponse) => {
      try {
        const url = req.url || '/';
        if (req.method === 'GET' && url === '/health') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, status: this.status(), port: this.port }));
          return;
        }

        // Minimal external channel MVP: webhook ingress
        // POST /message { text, conversationId?, mode?, modelId? }
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
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: e?.message ?? String(e) }));
      }
    });

    await new Promise<void>((resolve, reject) => {
      this.server!.once('error', reject);
      this.server!.listen(this.port, '127.0.0.1', () => resolve());
    });
    this.emit('gateway:started', { port: this.port });
  }

  async stop(): Promise<void> {
    if (!this.server) return;
    const s = this.server;
    this.server = null;
    await new Promise<void>((resolve) => s.close(() => resolve()));
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
    return { status: g.status(), port: g.getPort() };
  });
  ipcMain.handle('engineGateway:start', async (_e, params?: { port?: number }) => {
    await getGatewayDaemon().start(params?.port);
    return { success: true };
  });
  ipcMain.handle('engineGateway:stop', async () => {
    await getGatewayDaemon().stop();
    return { success: true };
  });
}

