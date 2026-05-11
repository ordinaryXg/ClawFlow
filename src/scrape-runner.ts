import { randomUUID } from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';
import { isSafeHttpUrl, normalizeHttpUrl } from './utils/normalize-http-url';
import { appendScrapeJob, ensureScrapeArtifactsDir, scrapeArtifactRelPath } from './scrape-service';
import type { ScrapeJobRecord } from './shared/scrape-jobs';
import { broadcastScrapeJobsUpdated } from './scrape-broadcast';

const FETCH_TIMEOUT_MS = 28_000;
const FETCH_MAX_BYTES = 900_000;
const DEFAULT_TOOL_MAX_CHARS = 24_000;
const ABS_TOOL_MAX_CHARS = 100_000;
const EXCERPT_HEAD = 800;

function clampMaxChars(n: unknown): number {
  const v = typeof n === 'number' && Number.isFinite(n) ? Math.floor(n) : DEFAULT_TOOL_MAX_CHARS;
  return Math.max(2000, Math.min(ABS_TOOL_MAX_CHARS, v));
}

function extractTitle(html: string): string | undefined {
  const m = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  const t = m?.[1]?.replace(/\s+/g, ' ')?.trim();
  return t || undefined;
}

/** 去掉 script/style 与标签，得到可读纯文本（MVP，不执行页面 JS） */
export function htmlToPlainText(html: string): string {
  let s = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ');
  s = s.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ');
  s = s.replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, ' ');
  s = s.replace(/<[^>]+>/g, ' ');
  s = s.replace(/&nbsp;/gi, ' ');
  s = s.replace(/&lt;/gi, '<');
  s = s.replace(/&gt;/gi, '>');
  s = s.replace(/&amp;/gi, '&');
  s = s.replace(/&quot;/gi, '"');
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

export type WebScrapeToolArgs = { url: string; max_chars?: number };

/**
 * 供 `web_scrape` 工具调用：拉取 HTML → 纯文本，写入 `.clawflow/scrapes`，追加任务记录，返回 JSON 字符串（对话回执）。
 */
export async function runWebScrapeForTool(
  args: WebScrapeToolArgs,
  ctx: { workspaceRoot: string; abortSignal?: AbortSignal }
): Promise<string> {
  const ws = String(ctx.workspaceRoot ?? '').trim();
  if (!ws) {
    return JSON.stringify({ ok: false, error: 'no_workspace' }, null, 2);
  }

  const rawUrl = String(args?.url ?? '').trim();
  const normalized = normalizeHttpUrl(rawUrl);
  if (!normalized || !isSafeHttpUrl(normalized)) {
    return JSON.stringify(
      {
        ok: false,
        error: 'invalid_or_unsafe_url',
        hint: 'Use http(s) URL only, e.g. https://example.com/path',
      },
      null,
      2
    );
  }

  const maxChars = clampMaxChars(args?.max_chars);
  const id = randomUUID();
  const jobBase: Pick<ScrapeJobRecord, 'id' | 'createdAt' | 'url'> = {
    id,
    createdAt: Date.now(),
    url: normalized,
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  const merged = ctx.abortSignal
    ? AbortSignal.any([controller.signal, ctx.abortSignal])
    : controller.signal;

  try {
    const res = await fetch(normalized, {
      method: 'GET',
      redirect: 'follow',
      signal: merged,
      headers: {
        Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
        'User-Agent': 'ClawFlow/1.0 (+https://github.com/ordinaryXg/ClawFlow) web_scrape',
      },
    });

    const buf = await res.arrayBuffer();
    const slice = buf.byteLength > FETCH_MAX_BYTES ? buf.slice(0, FETCH_MAX_BYTES) : buf;
    const html = new TextDecoder('utf-8', { fatal: false }).decode(slice);

    if (!res.ok) {
      const job: ScrapeJobRecord = {
        ...jobBase,
        status: 'error',
        errorMessage: `HTTP ${res.status} ${res.statusText}`,
      };
      await appendScrapeJob(ws, job);
      broadcastScrapeJobsUpdated(ws);
      return JSON.stringify(
        {
          ok: false,
          error: 'http_error',
          status: res.status,
          recordId: id,
        },
        null,
        2
      );
    }

    const title = extractTitle(html);
    const plain = htmlToPlainText(html);
    const charsTotal = plain.length;
    const artifactRel = scrapeArtifactRelPath(id);
    const absDir = await ensureScrapeArtifactsDir(ws);
    const absFile = path.join(absDir, `${id}.md`);
    const header = `---\nurl: ${normalized}\nscrapedAt: ${new Date().toISOString()}\nchars: ${charsTotal}\n---\n\n`;
    await fs.writeFile(absFile, `${header}${plain}`, 'utf-8');

    const truncated = plain.length > maxChars;
    const excerpt = plain.slice(0, maxChars) + (truncated ? '\n\n[…truncated for tool response…]' : '');

    const job: ScrapeJobRecord = {
      ...jobBase,
      title,
      status: 'ok',
      charsTotal,
      excerpt: plain.slice(0, EXCERPT_HEAD) + (plain.length > EXCERPT_HEAD ? '…' : ''),
      artifactRelPath: artifactRel,
    };
    await appendScrapeJob(ws, job);
    broadcastScrapeJobsUpdated(ws);

    return JSON.stringify(
      {
        ok: true,
        recordId: id,
        url: normalized,
        title: title ?? null,
        charsTotal,
        truncated,
        excerpt,
        artifactRelPath: artifactRel,
        note: 'Full plain text saved under workspace .clawflow/scrapes; right tab lists recent runs.',
      },
      null,
      2
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    const job: ScrapeJobRecord = {
      ...jobBase,
      status: 'error',
      errorMessage: msg,
    };
    await appendScrapeJob(ws, job);
    broadcastScrapeJobsUpdated(ws);
    return JSON.stringify({ ok: false, error: 'fetch_failed', message: msg, recordId: id }, null, 2);
  } finally {
    clearTimeout(timer);
  }
}
