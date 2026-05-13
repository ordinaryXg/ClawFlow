/**
 * 飞书开放平台 HTTP 调用（自建应用 tenant_access_token、IM 发文本消息）。
 * 文档：auth/v3/tenant_access_token/internal、im-v1/message/create
 */

import { classifyNetworkFailure, fetchWithProxyRetry } from '../utils/net-fetch';
import { readMessagingPrefsFile } from '../messaging-prefs';
import type { FeishuReceiveIdType } from '../messaging-prefs';

const FEISHU_OPEN_API = 'https://open.feishu.cn/open-apis';

const MAX_BODY_LOG = 16_000;

/** 携带完整上下文，供 IPC 与控制台输出 */
export class FeishuRequestError extends Error {
  readonly detail: Record<string, unknown>;

  constructor(summary: string, detail: Record<string, unknown>) {
    super(summary);
    this.name = 'FeishuRequestError';
    this.detail = detail;
  }

  detailJson(): string {
    try {
      return JSON.stringify(this.detail, null, 2);
    } catch {
      return String(this.detail);
    }
  }
}

function tryParseJson(raw: string): unknown {
  const trimmed = raw.trim();
  if (!trimmed) return { _emptyBody: true };
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return { _nonJsonBody: true, raw: raw.length > MAX_BODY_LOG ? `${raw.slice(0, MAX_BODY_LOG)}…` : raw };
  }
}

function summarizeLarkBody(parsed: unknown): string {
  if (!parsed || typeof parsed !== 'object') return String(parsed);
  const p = parsed as Record<string, unknown>;
  const parts: string[] = [];
  if (p.code !== undefined) parts.push(`code=${String(p.code)}`);
  if (typeof p.msg === 'string' && p.msg.trim()) parts.push(`msg=${p.msg.trim()}`);
  if (p.error !== undefined) {
    try {
      parts.push(`error=${JSON.stringify(p.error)}`);
    } catch {
      parts.push(`error=${String(p.error)}`);
    }
  }
  return parts.length ? parts.join(' | ') : JSON.stringify(parsed).slice(0, 500);
}

async function readResponsePayload(res: Response): Promise<{ raw: string; parsed: unknown }> {
  const raw = await res.text().catch(() => '');
  return { raw, parsed: tryParseJson(raw) };
}

function fail(
  phase: 'tenant_access_token' | 'im_send_message',
  url: string,
  res: Response,
  parsed: unknown,
  raw: string,
  extra?: Record<string, unknown>
): never {
  const summary = res.ok
    ? `Feishu ${phase}: ${summarizeLarkBody(parsed)}`
    : `Feishu ${phase}: HTTP ${res.status} ${res.statusText || ''}`.trim();
  const rawTrim = raw.length > MAX_BODY_LOG ? `${raw.slice(0, MAX_BODY_LOG)}…(truncated)` : raw;
  throw new FeishuRequestError(summary, {
    ...(extra ?? {}),
    phase,
    url,
    httpStatus: res.status,
    httpStatusText: res.statusText,
    httpOk: res.ok,
    bodySummary: summarizeLarkBody(parsed),
    bodyParsed: parsed,
    bodyRaw: rawTrim,
  });
}

export async function feishuGetTenantAccessToken(
  appId: string,
  appSecret: string
): Promise<{ token: string; expireSeconds: number }> {
  const url = `${FEISHU_OPEN_API}/auth/v3/tenant_access_token/internal`;
  let res: Response;
  try {
    res = await fetchWithProxyRetry(
      url,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
      },
      { timeoutMs: 25_000, retries: 1 }
    );
  } catch (e: unknown) {
    const net = classifyNetworkFailure(e, url);
    throw new FeishuRequestError(`Feishu tenant_access_token: 网络请求失败 — ${net.hint}`, {
      phase: 'tenant_access_token',
      url,
      network: net,
      thrown: e instanceof Error ? { name: e.name, message: e.message, stack: e.stack } : String(e),
    });
  }

  const { raw, parsed } = await readResponsePayload(res);
  if (!res.ok) {
    fail('tenant_access_token', url, res, parsed, raw);
  }
  const j = parsed as { code?: number; msg?: string; tenant_access_token?: string; expire?: number };
  if (j.code !== 0) {
    fail('tenant_access_token', url, res, parsed, raw);
  }
  const token = String(j.tenant_access_token ?? '').trim();
  if (!token) {
    throw new FeishuRequestError('Feishu tenant_access_token: empty tenant_access_token', {
      phase: 'tenant_access_token',
      url,
      httpStatus: res.status,
      bodyParsed: parsed,
      bodyRaw: raw.length > MAX_BODY_LOG ? `${raw.slice(0, MAX_BODY_LOG)}…` : raw,
    });
  }
  const expireSeconds = typeof j.expire === 'number' && Number.isFinite(j.expire) ? j.expire : 7200;
  return { token, expireSeconds };
}

export async function feishuSendTextMessage(params: {
  token: string;
  receiveIdType: FeishuReceiveIdType;
  receiveId: string;
  text: string;
}): Promise<void> {
  const u = new URL(`${FEISHU_OPEN_API}/im/v1/messages`);
  u.searchParams.set('receive_id_type', params.receiveIdType);
  const url = u.toString();
  let res: Response;
  try {
    res = await fetchWithProxyRetry(
      url,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          Authorization: `Bearer ${params.token}`,
        },
        body: JSON.stringify({
          receive_id: params.receiveId,
          msg_type: 'text',
          content: JSON.stringify({ text: params.text }),
        }),
      },
      { timeoutMs: 30_000, retries: 1 }
    );
  } catch (e: unknown) {
    const net = classifyNetworkFailure(e, url);
    throw new FeishuRequestError(`Feishu im_send_message: 网络请求失败 — ${net.hint}`, {
      phase: 'im_send_message',
      url,
      receiveIdType: params.receiveIdType,
      network: net,
      thrown: e instanceof Error ? { name: e.name, message: e.message, stack: e.stack } : String(e),
    });
  }

  const { raw, parsed } = await readResponsePayload(res);
  if (!res.ok) {
    fail('im_send_message', url, res, parsed, raw, {
      receive_id_type: params.receiveIdType,
      receive_id: params.receiveId,
    });
  }
  const j = parsed as { code?: number; msg?: string };
  if (j.code !== 0) {
    fail('im_send_message', url, res, parsed, raw, {
      receive_id_type: params.receiveIdType,
      receive_id: params.receiveId,
    });
  }
}

/** 解析本地/环境变量中的自建应用凭证（供 IPC 与飞书长连接共用） */
export function resolveFeishuAppCredentials(override?: { appId?: string; appSecret?: string }): { appId: string; appSecret: string } {
  const file = readMessagingPrefsFile();
  const appId = String(
    (override?.appId !== undefined ? override.appId : undefined) ?? file?.feishu?.appId ?? process.env.FEISHU_APP_ID ?? ''
  ).trim();
  const appSecret = String(
    (override?.appSecret !== undefined ? override.appSecret : undefined) ?? file?.feishu?.appSecret ?? process.env.FEISHU_APP_SECRET ?? ''
  ).trim();
  return { appId, appSecret };
}
