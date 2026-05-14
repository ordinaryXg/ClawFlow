import type { ModelProvider } from './provider';
import type { ChatCompletionRequest, ChatCompletionResult, ToolSchema } from './types';
import { apiModelFromClawId } from './model-id';
import { readOpenAiSseContentStream } from '../streaming/openai-sse';
import { readOpenAiSseAgentStream } from '../streaming/openai-sse-agent';
import { classifyNetworkFailure, fetchWithProxyRetry } from '../../utils/net-fetch';

function cloneJson<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

function fetchTimeoutMs(): number {
  const raw = Number(process.env.CLAWFLOW_FETCH_TIMEOUT_MS ?? 30_000);
  return Number.isFinite(raw) && raw >= 1000 ? raw : 30_000;
}

function fetchRetries(): number {
  const raw = Number(process.env.CLAWFLOW_FETCH_RETRIES ?? 1);
  return Number.isFinite(raw) ? Math.max(0, Math.min(3, Math.floor(raw))) : 1;
}

/**
 * DeepSeek 对工具 JSON Schema 校验偏严，易报：
 * `Required properties must match all properties in the object`
 * （与 OpenAI strict 下「required 须覆盖全部 properties」一致，部分场景即使未传 strict 也会校验）
 *
 * 发往 DeepSeek 时：去掉 function.strict，并对 object 形参把 required 设为 properties 的全部键。
 * 本地 ToolRuntime 仍使用原始 schema 做参数校验。
 */
function sanitizeToolsForDeepSeekRequest(tools: ToolSchema[] | undefined): ToolSchema[] | undefined {
  if (!tools?.length) return tools;
  return tools.map((tool) => {
    const t = cloneJson(tool);
    const fn = t.function;
    if (!fn) return t;
    delete (fn as { strict?: boolean }).strict;
    const params = fn.parameters;
    if (params && typeof params === 'object' && !Array.isArray(params) && (params as { type?: string }).type === 'object') {
      const p = params as Record<string, unknown>;
      const props = p.properties;
      if (props && typeof props === 'object' && !Array.isArray(props)) {
        const keys = Object.keys(props as Record<string, unknown>);
        if (keys.length) p.required = keys;
      }
    }
    return t;
  });
}

function logDeepSeekOutgoing(url: string, label: string, body: Record<string, unknown>): void {
  if (process.env.CLAWFLOW_DEBUG_HTTP !== '1') return;
  try {
    // eslint-disable-next-line no-console
    console.log(`[DeepSeek] ${label} POST ${url}`);
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(body, null, 2));
  } catch {
    // eslint-disable-next-line no-console
    console.log(`[DeepSeek] ${label} POST ${url}`, body);
  }
}

type DeepSeekChatResponse = {
  choices?: Array<{
    message?: {
      content?: string | null;
      reasoning_content?: string | null;
      tool_calls?: any;
    };
  }>;
  usage?: any;
};

export class DeepSeekProvider implements ModelProvider {
  id = 'deepseek' as const;

  constructor(
    private readonly opts: {
      /** Static key (e.g. from env); optional when `resolveApiKey` is provided */
      apiKey?: string;
      /** Resolved per request so UI-saved profiles work without restarting */
      resolveApiKey?: () => string | Promise<string>;
      baseUrl?: string;
      betaBaseUrl?: string;
    }
  ) {}

  private async resolvedKey(): Promise<string> {
    const fromResolver = this.opts.resolveApiKey ? await Promise.resolve(this.opts.resolveApiKey()) : '';
    return String(fromResolver || this.opts.apiKey || '').trim();
  }

  private getBaseUrl(useBeta: boolean): string {
    const base = this.opts.baseUrl?.trim() || 'https://api.deepseek.com';
    const beta = this.opts.betaBaseUrl?.trim() || 'https://api.deepseek.com/beta';
    return useBeta ? beta : base;
  }

  async chatCompletion(req: ChatCompletionRequest, opts?: { signal?: AbortSignal }): Promise<ChatCompletionResult> {
    const apiKey = await this.resolvedKey();
    if (!apiKey) throw new Error('DeepSeek API key is not configured');

    const useBeta = Boolean(req.modeConfig.useBetaBaseUrl);
    const url = `${this.getBaseUrl(useBeta)}/chat/completions`;

    // `thinking` / `reasoning_effort` are top-level fields (see DeepSeek API docs).
    // Do NOT wrap them in `extra_body` here: that key is only for the OpenAI SDK, which merges
    // extra_body into the JSON body; raw fetch would send an unknown `extra_body` object and beta
    // endpoints may reject it with invalidrequesterror.
    const body: Record<string, unknown> = {
      model: apiModelFromClawId(req.model),
      messages: req.messages,
    };

    if (req.modeConfig.tools?.length) {
      body.tools = sanitizeToolsForDeepSeekRequest(req.modeConfig.tools);
      body.tool_choice = 'auto';
    }
    if (req.modeConfig.reasoning_effort) body.reasoning_effort = req.modeConfig.reasoning_effort;
    if (req.modeConfig.thinking) body.thinking = req.modeConfig.thinking;

    // JSON mode: request structured output via response_format where supported (best-effort).
    if (req.modeConfig.jsonMode) {
      body.response_format = { type: 'json_object' };
    }

    logDeepSeekOutgoing(url, 'chat/completions', body);

    let res: Response;
    try {
      res = await fetchWithProxyRetry(
        url,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        },
        { timeoutMs: fetchTimeoutMs(), retries: fetchRetries(), signal: opts?.signal }
      );
    } catch (e: any) {
      const nf = classifyNetworkFailure(e, url);
      throw new Error(`DeepSeek fetch failed url=${url}: ${nf.hint}`);
    }
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`DeepSeek HTTP ${res.status}: ${text.slice(0, 800)}`);
    }
    const json = (await res.json()) as DeepSeekChatResponse;
    const msg = json?.choices?.[0]?.message;
    const content = typeof msg?.content === 'string' ? msg.content : '';
    const reasoning_content = typeof msg?.reasoning_content === 'string' ? msg.reasoning_content : undefined;
    const tool_calls = Array.isArray((msg as any)?.tool_calls) ? ((msg as any).tool_calls as any[]) : null;
    return {
      content,
      ...(reasoning_content ? { reasoning_content } : {}),
      ...(tool_calls ? { tool_calls } : {}),
      usage: json?.usage,
      raw: json,
    };
  }

  async streamChatCompletion(
    req: ChatCompletionRequest,
    onDelta: (text: string) => void,
    opts?: { signal?: AbortSignal }
  ): Promise<ChatCompletionResult> {
    const apiKey = await this.resolvedKey();
    if (!apiKey) throw new Error('DeepSeek API key is not configured');

    const useBeta = Boolean(req.modeConfig.useBetaBaseUrl);
    const url = `${this.getBaseUrl(useBeta)}/chat/completions`;

    const body: Record<string, unknown> = {
      model: apiModelFromClawId(req.model),
      messages: req.messages,
      stream: true,
    };

    if (req.modeConfig.tools?.length) {
      body.tools = sanitizeToolsForDeepSeekRequest(req.modeConfig.tools);
      body.tool_choice = 'auto';
    }
    if (req.modeConfig.reasoning_effort) body.reasoning_effort = req.modeConfig.reasoning_effort;
    if (req.modeConfig.thinking) body.thinking = req.modeConfig.thinking;
    if (req.modeConfig.jsonMode) body.response_format = { type: 'json_object' };

    logDeepSeekOutgoing(url, 'chat/completions (stream)', body);

    let res: Response;
    try {
      res = await fetchWithProxyRetry(
        url,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        },
        { timeoutMs: fetchTimeoutMs(), retries: fetchRetries(), signal: opts?.signal }
      );
    } catch (e: any) {
      const nf = classifyNetworkFailure(e, url);
      throw new Error(`DeepSeek stream fetch failed url=${url}: ${nf.hint}`);
    }
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`DeepSeek stream HTTP ${res.status}: ${text.slice(0, 800)}`);
    }

    let content = '';
    await readOpenAiSseContentStream(res.body, (d) => {
      content += d;
      onDelta(d);
    });

    return { content, raw: { streamed: true } };
  }

  async agentStreamChatCompletion(
    req: ChatCompletionRequest,
    handlers: {
      onReasoningDelta?: (text: string) => void;
      onContentDelta?: (text: string) => void;
      signal?: AbortSignal;
    }
  ): Promise<ChatCompletionResult> {
    const apiKey = await this.resolvedKey();
    if (!apiKey) throw new Error('DeepSeek API key is not configured');

    const useBeta = Boolean(req.modeConfig.useBetaBaseUrl);
    const url = `${this.getBaseUrl(useBeta)}/chat/completions`;

    const body: Record<string, unknown> = {
      model: apiModelFromClawId(req.model),
      messages: req.messages,
      stream: true,
    };

    if (req.modeConfig.tools?.length) {
      body.tools = sanitizeToolsForDeepSeekRequest(req.modeConfig.tools);
      body.tool_choice = 'auto';
    }
    if (req.modeConfig.reasoning_effort) body.reasoning_effort = req.modeConfig.reasoning_effort;
    if (req.modeConfig.thinking) body.thinking = req.modeConfig.thinking;
    if (req.modeConfig.jsonMode) body.response_format = { type: 'json_object' };

    logDeepSeekOutgoing(url, 'chat/completions (agent stream)', body);

    let res: Response;
    try {
      res = await fetchWithProxyRetry(
        url,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        },
        { timeoutMs: fetchTimeoutMs(), retries: fetchRetries(), signal: handlers.signal }
      );
    } catch (e: any) {
      const nf = classifyNetworkFailure(e, url);
      throw new Error(`DeepSeek agent stream fetch failed url=${url}: ${nf.hint}`);
    }
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`DeepSeek agent stream HTTP ${res.status}: ${text.slice(0, 800)}`);
    }

    return readOpenAiSseAgentStream(res.body, {
      onReasoningDelta: handlers.onReasoningDelta,
      onContentDelta: handlers.onContentDelta,
    });
  }
}

