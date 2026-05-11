import { ProxyAgent } from 'undici';

export type NetworkFailure = {
  errorCode: string;
  hint: string;
  details?: Record<string, unknown>;
};

function splitNoProxy(raw: string): string[] {
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function hostMatchesNoProxy(hostname: string, rule: string): boolean {
  const h = hostname.toLowerCase();
  const r = rule.toLowerCase();
  if (r === '*') return true;
  if (r.startsWith('.')) return h.endsWith(r);
  if (h === r) return true;
  // allow "example.com" to match "a.example.com"
  return h.endsWith(`.${r}`);
}

function shouldBypassProxy(url: URL, env: NodeJS.ProcessEnv): boolean {
  const noProxy = String(env.NO_PROXY ?? env.no_proxy ?? '').trim();
  if (!noProxy) return false;
  const rules = splitNoProxy(noProxy);
  if (!rules.length) return false;
  return rules.some((r) => hostMatchesNoProxy(url.hostname, r));
}

function proxyForUrl(url: URL, env: NodeJS.ProcessEnv): string | null {
  const isHttps = url.protocol === 'https:';
  const p =
    (isHttps ? String(env.HTTPS_PROXY ?? env.https_proxy ?? '') : String(env.HTTP_PROXY ?? env.http_proxy ?? '')) ||
    String(env.ALL_PROXY ?? env.all_proxy ?? '') ||
    '';
  const s = p.trim();
  return s || null;
}

export function classifyNetworkFailure(err: unknown, url: string): NetworkFailure {
  const e = err as any;
  const code = String(e?.code ?? e?.cause?.code ?? '').trim();
  const name = String(e?.name ?? '').trim();
  const msg = String(e?.message ?? String(err ?? '')).trim();

  if (code === 'ENOTFOUND') {
    return {
      errorCode: 'dns_not_found',
      hint: 'DNS 解析失败（ENOTFOUND）。检查网络/DNS，或在公司网络下配置 HTTP_PROXY/HTTPS_PROXY。',
      details: { code, name, message: msg, url },
    };
  }
  if (code === 'ECONNREFUSED') {
    return {
      errorCode: 'connection_refused',
      hint: '连接被拒绝（ECONNREFUSED）。可能被防火墙/代理拦截，或目标站点拒绝连接。',
      details: { code, name, message: msg, url },
    };
  }
  if (code === 'ETIMEDOUT' || code === 'ESOCKETTIMEDOUT' || code === 'UND_ERR_CONNECT_TIMEOUT') {
    return {
      errorCode: 'timeout',
      hint: '连接/读取超时。建议稍后重试；若在受限网络环境请配置 HTTP_PROXY/HTTPS_PROXY。',
      details: { code, name, message: msg, url },
    };
  }
  if (code === 'ECONNRESET') {
    return {
      errorCode: 'connection_reset',
      hint: '连接被重置（ECONNRESET）。常见于临时网络波动、代理中断或站点限流。建议重试或切换网络/代理。',
      details: { code, name, message: msg, url },
    };
  }
  if (code === 'EAI_AGAIN') {
    return {
      errorCode: 'dns_temporary_failure',
      hint: 'DNS 临时失败（EAI_AGAIN）。建议重试；检查网络或 DNS 设置。',
      details: { code, name, message: msg, url },
    };
  }
  if (code.startsWith('CERT_') || msg.toLowerCase().includes('certificate')) {
    return {
      errorCode: 'tls_certificate_error',
      hint: 'TLS/证书错误。可能被企业代理进行 HTTPS MITM，需要系统证书/代理配置，或使用允许的代理出口。',
      details: { code, name, message: msg, url },
    };
  }
  if (name === 'AbortError') {
    return {
      errorCode: 'aborted',
      hint: '请求被取消/超时中止。可尝试提高超时或重试。',
      details: { code, name, message: msg, url },
    };
  }

  return {
    errorCode: 'network_error',
    hint: '网络连接失败。若在公司/校园网环境，优先配置 HTTP_PROXY/HTTPS_PROXY；否则检查网络后重试。',
    details: { code: code || undefined, name: name || undefined, message: msg, url },
  };
}

export async function fetchWithProxyRetry(
  url: string,
  init: RequestInit,
  opts: { timeoutMs: number; retries: number; env?: NodeJS.ProcessEnv; signal?: AbortSignal }
): Promise<Response> {
  const env = opts.env ?? process.env;
  const u = new URL(url);

  const proxy = !shouldBypassProxy(u, env) ? proxyForUrl(u, env) : null;
  const dispatcher = proxy ? new ProxyAgent(proxy) : undefined;

  const attemptOnce = async (): Promise<Response> => {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), Math.max(1000, opts.timeoutMs));
    const signal = opts.signal ? AbortSignal.any([ac.signal, opts.signal]) : ac.signal;
    try {
      return await fetch(url, { ...init, signal, ...(dispatcher ? { dispatcher } : {}) } as any);
    } finally {
      clearTimeout(timer);
    }
  };

  const maxRetries = Math.max(0, Math.min(3, Math.floor(opts.retries)));
  let lastErr: unknown;
  for (let i = 0; i <= maxRetries; i++) {
    try {
      return await attemptOnce();
    } catch (e: unknown) {
      lastErr = e;
      const code = String((e as any)?.code ?? (e as any)?.cause?.code ?? '');
      const retryable = code === 'ECONNRESET' || code === 'ETIMEDOUT' || code === 'UND_ERR_CONNECT_TIMEOUT' || code === 'EAI_AGAIN';
      if (!retryable || i === maxRetries) break;
      const backoff = 250 * Math.pow(2, i);
      await new Promise((r) => setTimeout(r, backoff));
    }
  }
  throw lastErr ?? new Error('network_error');
}

