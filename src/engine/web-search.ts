/**
 * Multitask / Plan 网络搜索：行为与 OpenClaw 的 web_search 工具对齐（Brave API + 无密钥 DuckDuckGo 回退）。
 * 参考：openclaw/src/agents/tools/web-search.ts、extensions/brave、extensions/duckduckgo
 */

export const WEB_SEARCH_MAX_COUNT = 10;
export const WEB_SEARCH_DEFAULT_COUNT = 5;

export type ClawFlowWebSearchUserConfig = {
  enabled?: boolean;
  /** auto：有 Brave Key 时优先 Brave，否则 DuckDuckGo */
  provider?: 'auto' | 'brave' | 'duckduckgo';
  braveApiKey?: string;
  braveBaseUrl?: string;
  timeoutSeconds?: number;
};

export type ResolvedClawFlowWebSearch = {
  enabled: boolean;
  provider: 'auto' | 'brave' | 'duckduckgo';
  braveApiKey: string;
  braveBaseUrl: string;
  timeoutSeconds: number;
};

export type PublicWebSearchConfig = {
  enabled: boolean;
  provider: 'auto' | 'brave' | 'duckduckgo';
  braveBaseUrl: string;
  timeoutSeconds: number;
  braveApiKeyConfigured: boolean;
};

const DEFAULT_BRAVE_BASE = 'https://api.search.brave.com';
const DDG_HTML = 'https://html.duckduckgo.com/html';

export function resolveWebSearchConfig(
  input: ClawFlowWebSearchUserConfig | undefined,
  env: NodeJS.ProcessEnv
): ResolvedClawFlowWebSearch {
  const keyFromCfg = String(input?.braveApiKey ?? '').trim();
  const keyFromEnv = String(env.BRAVE_API_KEY ?? '').trim();
  const braveApiKey = keyFromCfg || keyFromEnv;
  const rawProvider = String(input?.provider ?? 'auto').toLowerCase();
  const provider: ResolvedClawFlowWebSearch['provider'] =
    rawProvider === 'brave' || rawProvider === 'duckduckgo' ? rawProvider : 'auto';
  const base = String(input?.braveBaseUrl ?? DEFAULT_BRAVE_BASE).replace(/\/+$/, '') || DEFAULT_BRAVE_BASE;
  return {
    enabled: input?.enabled !== false,
    provider,
    braveApiKey,
    braveBaseUrl: base,
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
    braveBaseUrl: ws.braveBaseUrl,
    timeoutSeconds: ws.timeoutSeconds,
    braveApiKeyConfigured: Boolean(ws.braveApiKey),
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
    const res = await fetch(url.toString(), {
      method: 'GET',
      headers: { Accept: 'application/json', 'X-Subscription-Token': params.apiKey },
      signal,
    });
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
    const res = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      },
      signal,
    });
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
  const preferBrave =
    ws.provider === 'brave' || (ws.provider === 'auto' && Boolean(ws.braveApiKey?.trim()));

  const notes: string[] = [];
  if (domainFilter.length) {
    notes.push('domain_filter is not applied in ClawFlow web_search (use Brave native search or a dedicated provider in OpenClaw).');
  }
  if (typeof args.max_tokens === 'number' && args.max_tokens > 0) {
    notes.push('max_tokens / max_tokens_per_page are Perplexity-specific; ignored in ClawFlow.');
  }

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

  if (ws.provider === 'duckduckgo') {
    const out = await runDdg();
    return out.payload;
  }

  if (preferBrave) {
    const b = await runBrave();
    if (b.ok) return b.payload;
    if (ws.provider === 'brave') {
      throw new Error(
        'web_search (brave) needs a Brave Search API key. Set BRAVE_API_KEY in the environment or configure webSearch.braveApiKey when creating the engine. If you do not want to use Brave, set webSearch.provider to "duckduckgo".'
      );
    }
    const ddg = await runDdg();
    return {
      ...ddg.payload,
      fallbackFrom: 'brave_unconfigured',
    };
  }

  const ddg = await runDdg();
  return ddg.payload;
}
