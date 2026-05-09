import type { ModelProvider } from './provider';
import type { ChatCompletionRequest, ChatCompletionResult } from './types';
import { apiModelFromClawId } from './model-id';
import { readOpenAiSseContentStream } from '../streaming/openai-sse';

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

  async chatCompletion(req: ChatCompletionRequest): Promise<ChatCompletionResult> {
    const apiKey = await this.resolvedKey();
    if (!apiKey) throw new Error('DeepSeek API key is not configured');

    const useBeta = Boolean(req.modeConfig.useBetaBaseUrl);
    const url = `${this.getBaseUrl(useBeta)}/chat/completions`;

    // DeepSeek supports OpenAI-format payload with extra_body for thinking.
    const body: any = {
      model: apiModelFromClawId(req.model),
      messages: req.messages,
    };

    if (req.modeConfig.tools?.length) body.tools = req.modeConfig.tools;
    if (req.modeConfig.reasoning_effort) body.reasoning_effort = req.modeConfig.reasoning_effort;
    if (req.modeConfig.thinking)
      body.extra_body = { ...((body.extra_body as object) ?? {}), thinking: req.modeConfig.thinking };

    // JSON mode: request structured output via response_format where supported (best-effort).
    if (req.modeConfig.jsonMode) {
      body.response_format = { type: 'json_object' };
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
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
    onDelta: (text: string) => void
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

    if (req.modeConfig.tools?.length) body.tools = req.modeConfig.tools;
    if (req.modeConfig.reasoning_effort) body.reasoning_effort = req.modeConfig.reasoning_effort;
    if (req.modeConfig.thinking)
      body.extra_body = { ...((body.extra_body as object) ?? {}), thinking: req.modeConfig.thinking };
    if (req.modeConfig.jsonMode) body.response_format = { type: 'json_object' };

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
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
}

