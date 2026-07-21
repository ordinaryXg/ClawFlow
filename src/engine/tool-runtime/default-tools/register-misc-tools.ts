import type { ToolRuntime } from '../tool-runtime-core';
import { runClawFlowWebSearch, WEB_SEARCH_MAX_COUNT } from '../../search/web-search';
import { runWebScrapeForTool } from '../../../main/scrape/scrape-runner';

export function registerMiscTools(rt: ToolRuntime): void {
  rt.register(
    {
      type: 'function',
      function: {
        name: 'get_date',
        description: 'Get current date in YYYY-MM-DD',
        strict: true,
        parameters: {
          type: 'object',
          properties: {},
          required: [],
          additionalProperties: false,
        },
      },
    },
    async () => {
      const d = new Date();
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      return `${yyyy}-${mm}-${dd}`;
    }
  );

  rt.register(
    {
      type: 'function',
      function: {
        name: 'web_search',
        description:
          'Search the web. Returns provider-normalized results (Bocha / Brave / SearXNG / DuckDuckGo per settings).',
        strict: true,
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search query string.' },
            count: {
              type: 'number',
              description: 'Number of results to return.',
              minimum: 1,
              maximum: WEB_SEARCH_MAX_COUNT,
            },
            country: { type: 'string', description: '2-letter country code for region-specific results.' },
            language: { type: 'string', description: 'ISO 639-1 language code for results.' },
            freshness: {
              type: 'string',
              description: 'Filter by time: day, week, month, or year.',
            },
            date_after: {
              type: 'string',
              description: 'Only results published after this date (YYYY-MM-DD).',
            },
            date_before: {
              type: 'string',
              description: 'Only results published before this date (YYYY-MM-DD).',
            },
            search_lang: {
              type: 'string',
              description: 'Result language hint (Brave: search_lang; SearXNG: language param, ISO 639-1).',
            },
            ui_lang: { type: 'string', description: 'Brave UI locale (language-region); ignored for SearXNG/DDG.' },
            domain_filter: {
              type: 'array',
              items: { type: 'string' },
              description: 'Perplexity native Search API domain filter.',
            },
            max_tokens: {
              type: 'number',
              description: 'Perplexity native Search API total content budget.',
              minimum: 1,
              maximum: 1000000,
            },
            max_tokens_per_page: {
              type: 'number',
              description: 'Perplexity native Search API max tokens extracted per page.',
              minimum: 1,
            },
          },
          required: ['query'],
          additionalProperties: false,
        },
      },
    },
    async (args, ctx) => {
      const out = await runClawFlowWebSearch(args as Record<string, unknown>, {
        abortSignal: ctx.abortSignal,
        config: ctx.config,
      });
      return JSON.stringify(out, null, 2);
    }
  );

  rt.register(
    {
      type: 'function',
      function: {
        name: 'web_scrape',
        description:
          'HTTP(S) GET a public page, convert HTML to plain text, save full text under workspace .agent/.clawflow/scrapes, and return a JSON receipt with excerpt for the chat. Best for static/document pages; heavy client-side rendering may yield incomplete text.',
        strict: true,
        parameters: {
          type: 'object',
          properties: {
            url: { type: 'string', description: 'https URL or domain; http(s) only.' },
            max_chars: {
              type: 'number',
              description:
                'Optional cap on excerpt length in tool JSON (default ~24000; full plain text still saved under .agent/.clawflow/scrapes).',
              minimum: 2000,
              maximum: 100000,
            },
          },
          required: ['url'],
          additionalProperties: false,
        },
      },
    },
    async (args, ctx) => {
      const maxChars =
        typeof (args as { max_chars?: unknown })?.max_chars === 'number'
          ? (args as { max_chars: number }).max_chars
          : undefined;
      return await runWebScrapeForTool(
        { url: String((args as { url?: unknown })?.url ?? ''), max_chars: maxChars },
        { workspaceRoot: ctx.workspaceRoot, abortSignal: ctx.abortSignal }
      );
    }
  );
}
