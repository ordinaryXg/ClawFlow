/**
 * Multitask / Plan 网络搜索：博查 Bocha Web Search API、Brave Search API、SearXNG JSON、DuckDuckGo HTML 回退。
 * 参考：openclaw/src/agents/tools/web-search.ts；SearXNG：`GET /search?format=json`
 */

import { classifyNetworkFailure, fetchWithProxyRetry } from '../utils/net-fetch';

export const WEB_SEARCH_MAX_COUNT = 10;
export const WEB_SEARCH_DEFAULT_COUNT = 5;

export type ClawFlowWebSearchUserConfig = {
  enabled?: boolean;
  /**
   * auto：已配置 searxngBaseUrl 时优先 SearXNG；失败或未配置时再试博查（需密钥）、Brave（需密钥）；最后 DuckDuckGo HTML。
   * 未指定 provider 时默认 searxng（仍须填写实例根 URL 才能成功请求；Bearer 为可选）。
   */
  provider?: 'auto' | 'bocha' | 'brave' | 'duckduckgo' | 'searxng';
  /** 博查 Web Search API Key（Bearer）；可用环境变量 BOCHA_API_KEY */
  bochaApiKey?: string;
  /** 博查 API 根，默认 https://api.bochaai.com */
  bochaBaseUrl?: string;
  braveApiKey?: string;
  braveBaseUrl?: string;
  /** SearXNG 实例根 URL，如 https://search.example.org（不要尾斜杠） */
  searxngBaseUrl?: string;
  /** 可选；部分私有实例使用 Bearer Token */
  searxngApiKey?: string;
  timeoutSeconds?: number;
};

export type ResolvedClawFlowWebSearch = {
  enabled: boolean;
  provider: 'auto' | 'bocha' | 'brave' | 'duckduckgo' | 'searxng';
  bochaApiKey: string;
  bochaBaseUrl: string;
  braveApiKey: string;
  braveBaseUrl: string;
  searxngBaseUrl: string;
  searxngApiKey: string;
  timeoutSeconds: number;
};

export type PublicWebSearchConfig = {
  enabled: boolean;
  provider: 'auto' | 'bocha' | 'brave' | 'duckduckgo' | 'searxng';
  bochaBaseUrl: string;
  braveBaseUrl: string;
  searxngBaseUrl: string;
  timeoutSeconds: number;
  bochaApiKeyConfigured: boolean;
  braveApiKeyConfigured: boolean;
  searxngConfigured: boolean;
  searxngApiKeyConfigured: boolean;
};

const DEFAULT_BRAVE_BASE = 'https://api.search.brave.com';
const DEFAULT_BOCHA_BASE = 'https://api.bochaai.com';
const DDG_HTML = 'https://html.duckduckgo.com/html';

export function resolveWebSearchConfig(
  input: ClawFlowWebSearchUserConfig | undefined,
  env: NodeJS.ProcessEnv
): ResolvedClawFlowWebSearch {
  const keyFromCfg = String(input?.braveApiKey ?? '').trim();
  const keyFromEnv = String(env.BRAVE_API_KEY ?? '').trim();
  const braveApiKey = keyFromCfg || keyFromEnv;
  const bochaFromCfg = String(input?.bochaApiKey ?? '').trim();
  const bochaFromEnv = String(env.BOCHA_API_KEY ?? '').trim();
  const bochaApiKey = bochaFromCfg || bochaFromEnv;
  const rawProvider = String(input?.provider ?? 'searxng').toLowerCase();
  const provider: ResolvedClawFlowWebSearch['provider'] =
    rawProvider === 'brave' || rawProvider === 'duckduckgo' || rawProvider === 'searxng' || rawProvider === 'bocha'
      ? rawProvider
      : rawProvider === 'auto'
        ? 'auto'
        : 'searxng';
  const base = String(input?.braveBaseUrl ?? DEFAULT_BRAVE_BASE).replace(/\/+$/, '') || DEFAULT_BRAVE_BASE;
  const bochaBase = String(input?.bochaBaseUrl ?? env.BOCHA_BASE_URL ?? DEFAULT_BOCHA_BASE)
    .trim()
    .replace(/\/+$/, '') || DEFAULT_BOCHA_BASE;
  const searxBase = String(input?.searxngBaseUrl ?? '').trim().replace(/\/+$/, '');
  const searxKey = String(input?.searxngApiKey ?? '').trim();
  return {
    enabled: input?.enabled !== false,
    provider,
    bochaApiKey,
    bochaBaseUrl: bochaBase,
    braveApiKey,
    braveBaseUrl: base,
    searxngBaseUrl: searxBase,
    searxngApiKey: searxKey,
    timeoutSeconds:
      typeof input?.timeoutSeconds === 'number' && Number.isFinite(input.timeoutSeconds)
        ? Math.max(5, Math.min(120, input.timeoutSeconds))
        : 25,
  };
}

export function sanitizeWebSearchForPublic(ws: ResolvedClawFlowWebSearch): PublicWebSearchConfig {
  return {
    enabled: ws.enabled,
    provider: ws.provider,
    bochaBaseUrl: ws.bochaBaseUrl,
    braveBaseUrl: ws.braveBaseUrl,
    searxngBaseUrl: ws.searxngBaseUrl,
    timeoutSeconds: ws.timeoutSeconds,
    bochaApiKeyConfigured: Boolean(ws.bochaApiKey?.trim()),
    braveApiKeyConfigured: Boolean(ws.braveApiKey),
    searxngConfigured: Boolean(ws.searxngBaseUrl?.trim()),
    searxngApiKeyConfigured: Boolean(ws.searxngApiKey?.trim()),
  };
}

function clampCount(n: unknown): number {
  const v = typeof n === 'number' && Number.isFinite(n) ? n : WEB_SEARCH_DEFAULT_COUNT;
  return Math.max(1, Math.min(WEB_SEARCH_MAX_COUNT, Math.floor(v)));
}

/** OpenClaw：day/week/month/year 或 Brave 简写 pd/pw/pm/py */
function normalizeBraveFreshness(raw: string | undefined): string | undefined {
  if (!raw?.trim()) return undefined;
  const v = raw.trim().toLowerCase();
  const map: Record<string, string> = {
    day: 'pd',
    week: 'pw',
    month: 'pm',
    year: 'py',
    pd: 'pd',
    pw: 'pw',
    pm: 'pm',
    py: 'py',
  };
  return map[v];
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, '/')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)));
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function decodeDuckDuckGoUrl(rawUrl: string): string {
  try {
    const normalized = rawUrl.startsWith('//') ? `https:${rawUrl}` : rawUrl;
    const parsed = new URL(normalized);
    const uddg = parsed.searchParams.get('uddg');
    if (uddg) return uddg;
  } catch {
    /* keep */
  }
  return rawUrl;
}

function readHrefAttribute(tagAttributes: string): string {
  return /\bhref="([^"]*)"/i.exec(tagAttributes)?.[1] ?? '';
}

function isBotChallenge(html: string): boolean {
  if (/class="[^"]*\bresult__a\b[^"]*"/i.test(html)) return false;
  return /g-recaptcha|are you a human|id="challenge-form"|name="challenge"/i.test(html);
}

function parseDuckDuckGoHtml(html: string): Array<{ title: string; url: string; snippet: string }> {
  const results: Array<{ title: string; url: string; snippet: string }> = [];
  const resultRegex = /<a\b(?=[^>]*\bclass="[^"]*\bresult__a\b[^"]*")([^>]*)>([\s\S]*?)<\/a>/gi;
  const nextResultRegex = /<a\b(?=[^>]*\bclass="[^"]*\bresult__a\b[^"]*")[^>]*>/i;

  for (const match of html.matchAll(resultRegex)) {
    const rawAttributes = match[1] ?? '';
    const rawTitle = match[2] ?? '';
    const rawUrl = readHrefAttribute(rawAttributes);
    const matchEnd = (match.index ?? 0) + match[0].length;
    const trailingHtml = html.slice(matchEnd);
    const nextResultIndex = trailingHtml.search(nextResultRegex);
    const scopedTrailingHtml = nextResultIndex >= 0 ? trailingHtml.slice(0, nextResultIndex) : trailingHtml;
    const snippetMatch = /<a\b(?=[^>]*\bclass="[^"]*\bresult__snippet\b[^"]*")[^>]*>([\s\S]*?)<\/a>/i.exec(
      scopedTrailingHtml
    );
    const rawSnippet = snippetMatch?.[1] ?? '';
    const title = decodeHtmlEntities(stripHtml(rawTitle));
    const url = decodeDuckDuckGoUrl(decodeHtmlEntities(rawUrl));
    const snippet = decodeHtmlEntities(stripHtml(rawSnippet));
    if (title && url) results.push({ title, url, snippet });
  }
  return results;
}

function siteNameFromUrl(url: string): string | undefined {
  try {
    return new URL(url).hostname;
  } catch {
    return undefined;
  }
}

type BraveWebEntry = { title?: string; url?: string; description?: string; age?: string };

async function fetchBraveWebSearch(params: {
  baseUrl: string;
  apiKey: string;
  query: string;
  count: number;
  country?: string;
  search_lang?: string;
  ui_lang?: string;
  freshness?: string;
  dateAfter?: string;
  dateBefore?: string;
  signal?: AbortSignal;
  timeoutMs: number;
}): Promise<Array<Record<string, unknown>>> {
  const url = new URL(`${params.baseUrl}/res/v1/web/search`);
  url.searchParams.set('q', params.query);
  url.searchParams.set('count', String(params.count));
  if (params.country) url.searchParams.set('country', params.country);
  if (params.search_lang) url.searchParams.set('search_lang', params.search_lang);
  if (params.ui_lang) url.searchParams.set('ui_lang', params.ui_lang);
  if (params.freshness) {
    url.searchParams.set('freshness', params.freshness);
  } else if (params.dateAfter && params.dateBefore) {
    url.searchParams.set('freshness', `${params.dateAfter}to${params.dateBefore}`);
  } else if (params.dateAfter) {
    url.searchParams.set('freshness', `${params.dateAfter}to${new Date().toISOString().slice(0, 10)}`);
  } else if (params.dateBefore) {
    url.searchParams.set('freshness', `1970-01-01to${params.dateBefore}`);
  }

  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), params.timeoutMs);
  const signal = params.signal ? mergeAbortSignals(params.signal, ac.signal) : ac.signal;
  try {
    const res = await fetchWithProxyRetry(
      url.toString(),
      { method: 'GET', headers: { Accept: 'application/json', 'X-Subscription-Token': params.apiKey } },
      { timeoutMs: params.timeoutMs, retries: 1, signal }
    );
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`Brave Search API error (${res.status}): ${detail.slice(0, 500) || res.statusText}`);
    }
    const data = (await res.json()) as { web?: { results?: BraveWebEntry[] } };
    const web = data.web;
    const rows: BraveWebEntry[] = web && Array.isArray(web.results) ? web.results : [];
    return rows.map((entry) => {
      const description = entry.description ?? '';
      const title = entry.title ?? '';
      const u = entry.url ?? '';
      return {
        title,
        url: u,
        description,
        published: entry.age || undefined,
        siteName: siteNameFromUrl(u) || undefined,
      };
    });
  } finally {
    clearTimeout(t);
  }
}

/** 博查 freshness：oneDay / oneWeek / oneMonth / oneYear / noLimit */
function normalizeBochaFreshness(
  freshnessRaw: string | undefined,
  dateAfter?: string,
  dateBefore?: string
): string {
  if (dateAfter?.trim() || dateBefore?.trim()) return 'noLimit';
  if (!freshnessRaw?.trim()) return 'noLimit';
  const v = freshnessRaw.trim().toLowerCase();
  const map: Record<string, string> = {
    day: 'oneDay',
    week: 'oneWeek',
    month: 'oneMonth',
    year: 'oneYear',
    pd: 'oneDay',
    pw: 'oneWeek',
    pm: 'oneMonth',
    py: 'oneYear',
    oneday: 'oneDay',
    oneweek: 'oneWeek',
    onemonth: 'oneMonth',
    oneyear: 'oneYear',
    nolimit: 'noLimit',
  };
  return map[v] ?? 'noLimit';
}

function extractBochaWebPages(json: unknown): Array<Record<string, unknown>> {
  if (!json || typeof json !== 'object') return [];
  const root = json as Record<string, unknown>;
  let webPages: unknown = root.webPages;
  if (root.data && typeof root.data === 'object') {
    const d = root.data as Record<string, unknown>;
    if (d.webPages) webPages = d.webPages;
  }
  if (!webPages || typeof webPages !== 'object') return [];
  const wp = webPages as Record<string, unknown>;
  const value = wp.value;
  if (!Array.isArray(value)) return [];
  return value.filter((x) => x && typeof x === 'object') as Array<Record<string, unknown>>;
}

async function fetchBochaWebSearch(params: {
  baseUrl: string;
  apiKey: string;
  query: string;
  count: number;
  freshness: string;
  signal?: AbortSignal;
  timeoutMs: number;
}): Promise<Array<Record<string, unknown>>> {
  const base = params.baseUrl.replace(/\/+$/, '');
  const url = `${base}/v1/web-search`;
  const body = {
    query: params.query,
    count: Math.max(1, Math.min(50, params.count)),
    summary: true,
    freshness: params.freshness,
  };

  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), params.timeoutMs);
  const signal = params.signal ? mergeAbortSignals(params.signal, ac.signal) : ac.signal;
  try {
    const res = await fetchWithProxyRetry(
      url,
      {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Authorization: `Bearer ${params.apiKey}`,
        },
        body: JSON.stringify(body),
      },
      { timeoutMs: params.timeoutMs, retries: 1, signal }
    );
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`Bocha Web Search API error (${res.status}): ${detail.slice(0, 500) || res.statusText}`);
    }
    const data = (await res.json()) as unknown;
    const rows = extractBochaWebPages(data);
    return rows.map((entry) => {
      const title = String(entry.name ?? '').trim();
      const u = String(entry.url ?? '').trim();
      const snippet = String(entry.snippet ?? '').trim();
      const summary = String(entry.summary ?? '').trim();
      const desc = summary || snippet;
      const published = String(entry.datePublished ?? entry.dateLastCrawled ?? '').trim() || undefined;
      const site = String(entry.siteName ?? '').trim() || siteNameFromUrl(u) || undefined;
      return {
        title,
        url: u,
        snippet: desc,
        description: desc,
        published,
        siteName: site,
      };
    });
  } finally {
    clearTimeout(t);
  }
}

function mergeAbortSignals(a: AbortSignal, b: AbortSignal): AbortSignal {
  if (a.aborted) return a;
  if (b.aborted) return b;
  const c = new AbortController();
  const onAbort = () => c.abort();
  a.addEventListener('abort', onAbort);
  b.addEventListener('abort', onAbort);
  return c.signal;
}

async function fetchDuckDuckGoSearch(params: {
  query: string;
  count: number;
  regionKl?: string;
  signal?: AbortSignal;
  timeoutMs: number;
}): Promise<Array<Record<string, unknown>>> {
  const url = new URL(DDG_HTML);
  url.searchParams.set('q', params.query);
  if (params.regionKl) url.searchParams.set('kl', params.regionKl);
  url.searchParams.set('kp', '-1');

  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), params.timeoutMs);
  const signal = params.signal ? mergeAbortSignals(params.signal, ac.signal) : ac.signal;
  try {
    const res = await fetchWithProxyRetry(
      url.toString(),
      {
        method: 'GET',
        headers: {
          'User-Agent':
            'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        },
      },
      { timeoutMs: params.timeoutMs, retries: 1, signal }
    );
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`DuckDuckGo search error (${res.status}): ${detail.slice(0, 400) || res.statusText}`);
    }
    const html = await res.text();
    if (isBotChallenge(html)) {
      throw new Error('DuckDuckGo returned a bot-detection challenge.');
    }
    const parsed = parseDuckDuckGoHtml(html).slice(0, params.count);
    return parsed.map((r) => ({
      title: r.title,
      url: r.url,
      snippet: r.snippet,
      siteName: siteNameFromUrl(r.url) || undefined,
    }));
  } finally {
    clearTimeout(t);
  }
}

/** SearXNG time_range：day / week / month / year */
function normalizeSearxngTimeRange(raw: string | undefined): string | undefined {
  if (!raw?.trim()) return undefined;
  const v = raw.trim().toLowerCase();
  const map: Record<string, string> = {
    day: 'day',
    week: 'week',
    month: 'month',
    year: 'year',
    pd: 'day',
    pw: 'week',
    pm: 'month',
    py: 'year',
  };
  return map[v];
}

type SearxngResultRow = { title?: string; url?: string; content?: string; engine?: string };

async function fetchSearxngSearch(params: {
  baseUrl: string;
  apiKey: string;
  query: string;
  count: number;
  language?: string;
  timeRange?: string;
  signal?: AbortSignal;
  timeoutMs: number;
}): Promise<Array<Record<string, unknown>>> {
  const url = new URL(`${params.baseUrl}/search`);
  url.searchParams.set('format', 'json');
  url.searchParams.set('q', params.query);
  const lang = (params.language ?? '').trim().toLowerCase();
  if (lang.length >= 2) {
    url.searchParams.set('language', lang.slice(0, 2));
  }
  if (params.timeRange && /^(day|week|month|year)$/.test(params.timeRange)) {
    url.searchParams.set('time_range', params.timeRange);
  }

  const headers: Record<string, string> = {
    Accept: 'application/json',
    'User-Agent': 'Mozilla/5.0 (compatible; ClawFlow/1.0)',
  };
  if (params.apiKey) {
    headers.Authorization = `Bearer ${params.apiKey}`;
  }

  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), params.timeoutMs);
  const signal = params.signal ? mergeAbortSignals(params.signal, ac.signal) : ac.signal;
  try {
    const res = await fetchWithProxyRetry(url.toString(), { method: 'GET', headers }, { timeoutMs: params.timeoutMs, retries: 1, signal });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`SearXNG error (${res.status}): ${detail.slice(0, 400) || res.statusText}`);
    }
    const data = (await res.json()) as { results?: SearxngResultRow[] };
    const rows = Array.isArray(data.results) ? data.results : [];
    const lim = Math.max(1, Math.min(WEB_SEARCH_MAX_COUNT, params.count));
    return rows.slice(0, lim).map((entry) => {
      const title = String(entry.title ?? '').trim();
      const u = String(entry.url ?? '').trim();
      const snippet = String(entry.content ?? '').trim();
      return {
        title,
        url: u,
        snippet,
        description: snippet,
        siteName: siteNameFromUrl(u) || undefined,
        ...(entry.engine ? { engine: entry.engine } : {}),
      };
    });
  } finally {
    clearTimeout(t);
  }
}

/** 将 ISO 国家码粗映射为 DDG kl（与 OpenClaw 行为接近，非精确） */
function guessDdgKl(country: string | undefined, language: string | undefined): string | undefined {
  const c = String(country ?? '')
    .trim()
    .toLowerCase();
  const lang = String(language ?? '')
    .trim()
    .toLowerCase();
  if (c.length === 2) {
    if (lang.startsWith('zh') || c === 'cn') return 'cn-zh';
    if (c === 'us') return 'us-en';
    if (c === 'uk' || c === 'gb') return 'uk-en';
    if (c === 'de') return 'de-de';
    if (c === 'jp') return 'jp-jp';
    return `${c}-en`;
  }
  if (lang === 'zh' || lang.startsWith('zh-')) return 'cn-zh';
  return undefined;
}

function collectIgnoredForDdg(args: Record<string, unknown>): string[] {
  const keys: string[] = [];
  const check = (k: string, v: unknown) => {
    if (v === undefined || v === null) return;
    if (typeof v === 'string' && !v.trim()) return;
    if (typeof v === 'number' && (k === 'max_tokens' || k === 'max_tokens_per_page') && v === 0) return;
    if (Array.isArray(v) && v.length === 0) return;
    keys.push(k);
  };
  check('freshness', args.freshness);
  check('date_after', args.date_after);
  check('date_before', args.date_before);
  check('ui_lang', args.ui_lang);
  check('domain_filter', args.domain_filter);
  check('max_tokens', args.max_tokens);
  check('max_tokens_per_page', args.max_tokens_per_page);
  return keys;
}

/**
 * 执行网络搜索；返回可被 JSON 序列化的结果（与 OpenClaw web_search 返回结构相近）。
 */
export async function runClawFlowWebSearch(
  args: Record<string, unknown>,
  ctx: { abortSignal?: AbortSignal; config?: { webSearch?: ResolvedClawFlowWebSearch } }
): Promise<Record<string, unknown>> {
  const ws = ctx.config?.webSearch;
  if (!ws?.enabled) {
    throw new Error('web_search is disabled.');
  }

  const query = String(args.query ?? '').trim();
  if (!query) throw new Error('web_search: missing query');

  const count = clampCount(args.count);
  const country = String(args.country ?? '').trim() || undefined;
  const language = String(args.language ?? '').trim() || undefined;
  const search_lang = String(args.search_lang ?? '').trim() || undefined;
  const ui_lang = String(args.ui_lang ?? '').trim() || undefined;
  const freshnessRaw = String(args.freshness ?? '').trim() || undefined;
  const dateAfter = String(args.date_after ?? '').trim() || undefined;
  const dateBefore = String(args.date_before ?? '').trim() || undefined;
  const domainFilter = Array.isArray(args.domain_filter) ? args.domain_filter : [];

  const timeoutMs = Math.max(5000, (ws.timeoutSeconds ?? 25) * 1000);
  const hasSearxng = Boolean(ws.searxngBaseUrl?.trim());
  const hasBocha = Boolean(ws.bochaApiKey?.trim());

  const notes: string[] = [];
  if (domainFilter.length) {
    notes.push(
      'domain_filter is not applied in ClawFlow web_search (Bocha / Brave API / SearXNG / DDG HTML paths do not map this field).'
    );
  }
  if (typeof args.max_tokens === 'number' && args.max_tokens > 0) {
    notes.push('max_tokens / max_tokens_per_page are Perplexity-specific; ignored in ClawFlow.');
  }

  const searxTime = normalizeSearxngTimeRange(freshnessRaw);
  const searxngIgnored = collectIgnoredForDdg({
    freshness: searxTime ? undefined : freshnessRaw,
    date_after: dateAfter,
    date_before: dateBefore,
    ui_lang: ui_lang,
    domain_filter: domainFilter,
    max_tokens: args.max_tokens,
    max_tokens_per_page: args.max_tokens_per_page,
  });

  const runBocha = async () => {
    const apiKey = ws.bochaApiKey.trim();
    if (!apiKey) {
      return { ok: false as const, reason: 'missing_bocha_api_key' };
    }
    const freshness = normalizeBochaFreshness(freshnessRaw, dateAfter, dateBefore);
    if (dateAfter || dateBefore) {
      notes.push('Bocha: date_after/date_before are not mapped to API freshness; using noLimit for this request.');
    }
    const rows = await fetchBochaWebSearch({
      baseUrl: ws.bochaBaseUrl,
      apiKey,
      query,
      count,
      freshness,
      signal: ctx.abortSignal,
      timeoutMs,
    });
    return {
      ok: true as const,
      provider: 'bocha' as const,
      payload: {
        query,
        provider: 'bocha',
        count: rows.length,
        results: rows,
        ...(notes.length ? { notes } : {}),
      },
    };
  };

  const runBrave = async () => {
    const apiKey = ws.braveApiKey?.trim();
    if (!apiKey) {
      return { ok: false as const, reason: 'missing_brave_api_key' };
    }
    const freshness = normalizeBraveFreshness(freshnessRaw);
    const rows = await fetchBraveWebSearch({
      baseUrl: ws.braveBaseUrl,
      apiKey,
      query,
      count,
      country,
      search_lang: search_lang || language,
      ui_lang,
      freshness,
      dateAfter,
      dateBefore,
      signal: ctx.abortSignal,
      timeoutMs,
    });
    return {
      ok: true as const,
      provider: 'brave',
      payload: {
        query,
        provider: 'brave',
        count: rows.length,
        results: rows,
        ...(notes.length ? { notes } : {}),
      },
    };
  };

  const runDdg = async () => {
    const ignored = collectIgnoredForDdg({
      freshness: freshnessRaw,
      date_after: dateAfter,
      date_before: dateBefore,
      ui_lang: ui_lang,
      domain_filter: domainFilter,
      max_tokens: args.max_tokens,
      max_tokens_per_page: args.max_tokens_per_page,
    });
    const regionKl = guessDdgKl(country, language || search_lang);
    const rows = await fetchDuckDuckGoSearch({
      query,
      count,
      regionKl,
      signal: ctx.abortSignal,
      timeoutMs,
    });
    return {
      ok: true as const,
      provider: 'duckduckgo',
      payload: {
        query,
        provider: 'duckduckgo',
        count: rows.length,
        results: rows,
        ...(ignored.length ? { ignoredFilters: ignored } : {}),
        ...(notes.length ? { notes } : {}),
        externalContent: { untrusted: true, source: 'web_search' },
      },
    };
  };

  const runSearxng = async () => {
    const base = ws.searxngBaseUrl.trim();
    const timeRange = searxTime;
    const rows = await fetchSearxngSearch({
      baseUrl: base,
      apiKey: ws.searxngApiKey?.trim() ?? '',
      query,
      count,
      language: search_lang || language,
      timeRange,
      signal: ctx.abortSignal,
      timeoutMs,
    });
    return {
      ok: true as const,
      provider: 'searxng' as const,
      payload: {
        query,
        provider: 'searxng',
        count: rows.length,
        results: rows,
        ...(searxngIgnored.length ? { ignoredFilters: searxngIgnored } : {}),
        ...(notes.length ? { notes } : {}),
        externalContent: { untrusted: true, source: 'web_search' },
      },
    };
  };

  const failureBaseUrl = (provider: 'bocha' | 'brave' | 'duckduckgo' | 'searxng') => {
    if (provider === 'brave') return ws.braveBaseUrl;
    if (provider === 'bocha') return ws.bochaBaseUrl || DEFAULT_BOCHA_BASE;
    if (provider === 'searxng') return ws.searxngBaseUrl || 'searxng';
    return DDG_HTML;
  };

  const wrapFailure = (provider: 'bocha' | 'brave' | 'duckduckgo' | 'searxng', e: unknown) => {
    const nf = classifyNetworkFailure(e, failureBaseUrl(provider));
    return {
      ok: false,
      provider,
      errorCode: nf.errorCode,
      hint: nf.hint,
      details: nf.details ?? null,
      note: '如在公司/校园网，请优先设置 HTTP_PROXY/HTTPS_PROXY/NO_PROXY 环境变量；ClawFlow 已支持代理与轻量重试。',
      clawflow_search_readme_zh:
        '本应用 web_search：可在系统设置中选择搜索源。支持博查 Bocha、Brave Search API、自建 SearXNG（/search?format=json）、以及无密钥 DuckDuckGo HTML（易限流）。抓取具体站点请用 web_scrape 或内嵌浏览器。',
    } as Record<string, unknown>;
  };

  if (ws.provider === 'searxng') {
    if (!hasSearxng) {
      return {
        ok: false,
        provider: 'searxng',
        errorCode: 'missing_config',
        hint: 'Configure searxngBaseUrl in Settings → System → Web search, or set CLAWFLOW_SEARXNG_URL.',
      } as Record<string, unknown>;
    }
    try {
      const out = await runSearxng();
      return out.payload;
    } catch (e: unknown) {
      return wrapFailure('searxng', e);
    }
  }

  if (ws.provider === 'duckduckgo') {
    try {
      const out = await runDdg();
      return out.payload;
    } catch (e: unknown) {
      return wrapFailure('duckduckgo', e);
    }
  }

  if (ws.provider === 'bocha') {
    if (!hasBocha) {
      return {
        ok: false,
        provider: 'bocha',
        errorCode: 'missing_config',
        hint: 'Configure bochaApiKey in Settings → System → Web search, or set BOCHA_API_KEY.',
      } as Record<string, unknown>;
    }
    try {
      const out = await runBocha();
      if (!out.ok) {
        return {
          ok: false,
          provider: 'bocha',
          errorCode: 'missing_config',
          hint: 'Bocha Web Search requires an API key from https://open.bochaai.com/',
        } as Record<string, unknown>;
      }
      return out.payload;
    } catch (e: unknown) {
      return wrapFailure('bocha', e);
    }
  }

  if (ws.provider === 'auto') {
    if (hasSearxng) {
      try {
        const sx = await runSearxng();
        return sx.payload;
      } catch {
        /* fall through to Brave / DDG */
      }
    }
    const bochaKey = ws.bochaApiKey?.trim();
    if (bochaKey) {
      try {
        const bc = await runBocha();
        if (bc.ok) {
          return {
            ...bc.payload,
            ...(hasSearxng ? { fallbackFrom: 'searxng_failed' } : {}),
          };
        }
      } catch {
        /* fall through */
      }
    }
    const braveKey = ws.braveApiKey?.trim();
    if (braveKey) {
      try {
        const b = await runBrave();
        if (b.ok) {
          return {
            ...b.payload,
            ...(hasSearxng ? { fallbackFrom: 'searxng_failed' } : bochaKey ? { fallbackFrom: 'bocha_failed' } : {}),
          };
        }
      } catch {
        /* fall through */
      }
    }
    try {
      const ddg = await runDdg();
      let fallbackFrom: string | undefined;
      if (hasSearxng) fallbackFrom = 'searxng_failed';
      else if (bochaKey) fallbackFrom = 'bocha_failed';
      else if (braveKey) fallbackFrom = 'brave_failed';
      return {
        ...ddg.payload,
        ...(fallbackFrom ? { fallbackFrom } : {}),
      };
    } catch (e: unknown) {
      return wrapFailure('duckduckgo', e);
    }
  }

  if (ws.provider === 'brave') {
    try {
      const b = await runBrave();
      if (b.ok) return b.payload;
    } catch (e: unknown) {
      return wrapFailure('brave', e);
    }
    throw new Error(
      'web_search (brave) needs a Brave Search API key. Set BRAVE_API_KEY in the environment or configure webSearch.braveApiKey when creating the engine. If you do not want to use Brave, set webSearch.provider to "duckduckgo", "bocha", or "searxng".'
    );
  }

  const _never: never = ws.provider;
  return _never;
}
