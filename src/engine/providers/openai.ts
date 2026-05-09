import type { ModelProvider } from './provider';
import type { ChatCompletionRequest, ChatCompletionResult, ToolCall } from './types';
import { apiModelFromClawId } from './model-id';
import { readOpenAiSseContentStream } from '../streaming/openai-sse';

type OpenAiChatResponse = {
  choices?: Array<{
    message?: {
      content?: string | null;
      tool_calls?: unknown[];
      reasoning_content?: string | null;
    };
  }>;
  usage?: Record<string, unknown>;
};

export class OpenAIProvider implements ModelProvider {
  id = 'openai' as const;

  constructor(
    private readonly opts: {
      apiKey?: string;
      resolveApiKey?: () => string | Promise<string>;
      /** Override base, e.g. Azure proxy (must end without /v1 if using path below) */
      baseUrl?: string;
    }
  ) {}

  private async resolvedKey(): Promise<string> {
    const fromResolver = this.opts.resolveApiKey ? await Promise.resolve(this.opts.resolveApiKey()) : '';
    return String(fromResolver || this.opts.apiKey || '').trim();
  }

  async chatCompletion(req: ChatCompletionRequest, opts?: { signal?: AbortSignal }): Promise<ChatCompletionResult> {
    const apiKey = await this.resolvedKey();
    if (!apiKey) throw new Error('OpenAI API key is not configured');

    const base = (this.opts.baseUrl ?? 'https://api.openai.com').replace(/\/$/, '');
    const url = `${base}/v1/chat/completions`;

    const body: Record<string, unknown> = {
      model: apiModelFromClawId(req.model),
      messages: req.messages,
    };

    if (req.modeConfig.tools?.length) {
      body.tools = req.modeConfig.tools;
      body.tool_choice = 'auto';
    }
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
      ...(opts?.signal ? { signal: opts.signal } : {}),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`OpenAI HTTP ${res.status}: ${text.slice(0, 800)}`);
    }
    const json = (await res.json()) as OpenAiChatResponse;
    const msg = json?.choices?.[0]?.message;
    const content = typeof msg?.content === 'string' ? msg.content : '';
    const tool_calls = Array.isArray(msg?.tool_calls) ? (msg.tool_calls as ToolCall[]) : null;
    const reasoning_content =
      typeof msg?.reasoning_content === 'string' ? msg.reasoning_content : undefined;
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
    if (!apiKey) throw new Error('OpenAI API key is not configured');

    const base = (this.opts.baseUrl ?? 'https://api.openai.com').replace(/\/$/, '');
    const url = `${base}/v1/chat/completions`;

    const body: Record<string, unknown> = {
      model: apiModelFromClawId(req.model),
      messages: req.messages,
      stream: true,
    };

    if (req.modeConfig.tools?.length) {
      body.tools = req.modeConfig.tools;
      body.tool_choice = 'auto';
    }
    if (req.modeConfig.jsonMode) body.response_format = { type: 'json_object' };

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      ...(opts?.signal ? { signal: opts.signal } : {}),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`OpenAI stream HTTP ${res.status}: ${text.slice(0, 800)}`);
    }

    let content = '';
    await readOpenAiSseContentStream(res.body, (d) => {
      content += d;
      onDelta(d);
    });

    return { content, raw: { streamed: true } };
  }
}
