/**
 * 技能市场索引：仅允许 HTTPS + 主机白名单，限制体积，校验 JSON 结构。
 * 安装仍走 OpenClaw CLI，不向索引中的任意 URL 执行下载脚本。
 */

import * as https from 'https';
import { URL } from 'url';
import type { SkillMarketEntry, SkillMarketFetchResult, SkillMarketIndexFile } from './skill-market-shared';

export type { SkillMarketEntry, SkillMarketFetchResult, SkillMarketIndexFile, SkillMarketSource } from './skill-market-shared';

/** 内置兜底（需与仓库 assets/skill-market-index.json 保持条目一致）。 */
const BUNDLED_FALLBACK: SkillMarketIndexFile = {
  version: 1,
  updatedAt: '2026-05-07',
  skills: [
    {
      id: 'westock-data',
      name: 'westock-data',
      title: 'A股个股详情',
      description: 'A股个股详情查询工具（示例条目，可按 OpenClaw 包名调整）。',
      version: '1.0.0',
      package: 'westock-data',
    },
    {
      id: 'westock-tool',
      name: 'westock-tool',
      title: 'A股筛选策略',
      description: 'A股筛选策略工具（示例条目）。',
      version: '1.0.0',
      package: 'westock-tool',
    },
  ],
};

/** 与仓库中 assets/skill-market-index.json 保持一致（用于在线更新）。 */
export const DEFAULT_SKILL_MARKET_URL =
  'https://raw.githubusercontent.com/ordinaryXg/ClawFlow/master/assets/skill-market-index.json';

/** GitHub Raw 不可达时尝试 jsDelivr（同仓库内容，国内网络往往更易访问）。 */
const DEFAULT_SKILL_MARKET_JSDELIVR_URL =
  'https://cdn.jsdelivr.net/gh/ordinaryXg/ClawFlow@master/assets/skill-market-index.json';

const MAX_BODY_BYTES = 512 * 1024;
const FETCH_TIMEOUT_MS = 12_000;
const REMOTE_CACHE_MS = 5 * 60 * 1000;

const ALLOWED_HOSTNAMES = new Set(['raw.githubusercontent.com', 'cdn.jsdelivr.net']);

const SAFE_PACKAGE_RE = /^[a-zA-Z0-9@/_.-]{1,128}$/;
const SAFE_ID_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/;

let remoteCache: { at: number; index: SkillMarketIndexFile } | null = null;

function getMarketUrlFromEnv(): string {
  const u = String(process.env.CLAWFLOW_SKILL_MARKET_URL || '').trim();
  return u || DEFAULT_SKILL_MARKET_URL;
}

function remoteUrlsToTry(): string[] {
  const primary = getMarketUrlFromEnv();
  const list = [primary];
  const envCustom = Boolean(String(process.env.CLAWFLOW_SKILL_MARKET_URL || '').trim());
  if (!envCustom && primary === DEFAULT_SKILL_MARKET_URL) {
    list.push(DEFAULT_SKILL_MARKET_JSDELIVR_URL);
  }
  return list;
}

function assertMarketUrl(url: URL): void {
  if (url.protocol !== 'https:') throw new Error('Only HTTPS market URLs are allowed');
  if (!hostnameAllowed(url.hostname)) throw new Error('Market host not allowed');
}

function parseAllowedExtraHosts(): Set<string> {
  const raw = String(process.env.CLAWFLOW_SKILL_MARKET_EXTRA_HOSTS || '').trim();
  const next = new Set(ALLOWED_HOSTNAMES);
  if (!raw) return next;
  for (const h of raw.split(/[,;\s]+/)) {
    const x = h.trim().toLowerCase();
    if (x) next.add(x);
  }
  return next;
}

function hostnameAllowed(hostname: string): boolean {
  const extra = parseAllowedExtraHosts();
  return extra.has(hostname.toLowerCase());
}

function readBundled(): SkillMarketIndexFile {
  return validateAndNormalizeIndex(BUNDLED_FALLBACK);
}

function validateAndNormalizeIndex(raw: unknown): SkillMarketIndexFile {
  if (!raw || typeof raw !== 'object') throw new Error('Invalid index: not an object');
  const o = raw as Record<string, unknown>;
  const ver = o.version;
  if (typeof ver !== 'number' || ver < 1) throw new Error('Invalid index: version');

  const skillsRaw = o.skills;
  if (!Array.isArray(skillsRaw)) throw new Error('Invalid index: skills');

  const skills: SkillMarketEntry[] = [];
  for (const it of skillsRaw) {
    if (!it || typeof it !== 'object') continue;
    const x = it as Record<string, unknown>;
    const id = typeof x.id === 'string' ? x.id.trim() : '';
    const name = typeof x.name === 'string' ? x.name.trim() : '';
    const description = typeof x.description === 'string' ? x.description.trim() : '';
    const version = typeof x.version === 'string' ? x.version.trim() : '';
    const pkg = typeof x.package === 'string' ? x.package.trim() : '';
    const title = typeof x.title === 'string' ? x.title.trim() : undefined;

    if (!id || !SAFE_ID_RE.test(id)) continue;
    if (!name || !SAFE_ID_RE.test(name)) continue;
    if (!pkg || !SAFE_PACKAGE_RE.test(pkg)) continue;
    if (description.length > 4000) continue;
    if (version.length > 64) continue;

    skills.push({
      id,
      name,
      ...(title ? { title } : {}),
      description: description || name,
      version: version || '0.0.0',
      package: pkg,
    });
  }

  return {
    version: ver,
    ...(typeof o.updatedAt === 'string' ? { updatedAt: o.updatedAt } : {}),
    skills,
  };
}

function fetchHttpsJson(urlStr: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    let url: URL;
    try {
      url = new URL(urlStr);
    } catch {
      reject(new Error('Invalid market URL'));
      return;
    }
    try {
      assertMarketUrl(url);
    } catch (err) {
      reject(err instanceof Error ? err : new Error(String(err)));
      return;
    }

    const req = https.request(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port || 443,
        path: `${url.pathname}${url.search}`,
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'User-Agent': 'ClawFlow/skill-market (Electron)',
        },
        timeout: FETCH_TIMEOUT_MS,
      },
      (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          reject(new Error(`Market HTTP ${res.statusCode ?? 'error'}`));
          return;
        }
        const chunks: Buffer[] = [];
        let total = 0;
        res.on('data', (chunk: Buffer) => {
          total += chunk.length;
          if (total > MAX_BODY_BYTES) {
            res.destroy();
            req.destroy();
            reject(new Error('Market response too large'));
            return;
          }
          chunks.push(chunk);
        });
        res.on('end', () => resolve(Buffer.concat(chunks)));
      }
    );
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Market request timeout'));
    });
    req.on('error', reject);
    req.end();
  });
}

export async function fetchSkillMarketIndex(options?: { forceRefresh?: boolean }): Promise<SkillMarketFetchResult> {
  const force = Boolean(options?.forceRefresh);
  const now = Date.now();

  if (!force && remoteCache && now - remoteCache.at < REMOTE_CACHE_MS) {
    return { ok: true, index: remoteCache.index, source: 'remote+cached' };
  }

  try {
    const urls = remoteUrlsToTry();
    const attemptErrors: string[] = [];
    for (const url of urls) {
      try {
        const buf = await fetchHttpsJson(url);
        const text = buf.toString('utf-8');
        const parsed = JSON.parse(text) as unknown;
        const index = validateAndNormalizeIndex(parsed);
        remoteCache = { at: now, index };
        const warning =
          attemptErrors.length > 0
            ? `Backup source used. ${attemptErrors.join(' | ').slice(0, 480)}`
            : undefined;
        return { ok: true, index, source: 'remote', ...(warning ? { warning } : {}) };
      } catch (err) {
        const m = err instanceof Error ? err.message : String(err);
        attemptErrors.push(`${url} → ${m}`);
      }
    }
    throw new Error(attemptErrors.join(' | ') || 'Market fetch failed');
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    try {
      const bundled = readBundled();
      return {
        ok: true,
        index: bundled,
        source: 'bundled',
        warning: msg,
      };
    } catch (inner) {
      const innerMsg = inner instanceof Error ? inner.message : String(inner);
      return { ok: false, error: `${msg} · bundled: ${innerMsg}` };
    }
  }
}
