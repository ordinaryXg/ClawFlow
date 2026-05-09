import type { ModelProvider } from './provider';
import type { ChatCompletionRequest, ChatCompletionResult } from './types';
import { apiModelFromClawId } from './model-id';

type AnthropicResp = {
  content?: Array<{ type?: string; text?: string }>;
  usage?: Record<string, unknown>;
};

export class AnthropicProvider implements ModelProvider {
  id = 'anthropic' as const;

  constructor(
    private readonly opts: {
      apiKey?: string;
      resolveApiKey?: () => string | Promise<string>;
      baseUrl?: string;
    }
  ) {}

  private async resolvedKey(): Promise<string> {
    const fromResolver = this.opts.resolveApiKey ? await Promise.resolve(this.opts.resolveApiKey()) : '';
    return String(fromResolver || this.opts.apiKey || '').trim();
  }

  async chatCompletion(req: ChatCompletionRequest): Promise<ChatCompletionResult> {
    const apiKey = await this.resolvedKey();
    if (!apiKey) throw new Error('Anthropic API key is not configured');

    if (req.modeConfig.tools?.length) {
      throw new Error(
        '[内置引擎] Anthropic 暂不支持带工具的 Multitask，请改用 DeepSeek/OpenAI 或 Ask、Plan。'
      );
    }

    for (const m of req.messages) {
      if (m.role === 'tool') {
        throw new Error('[内置引擎] Anthropic 暂不支持工具轮次，请新建会话或仅用 Ask/Plan。');
      }
    }

    const model = apiModelFromClawId(req.model);
    const systemChunks: string[] = [];
    const msgs: Array<{ role: 'user' | 'assistant'; content: string }> = [];

    for (const m of req.messages) {
      if (m.role === 'system') systemChunks.push(String(m.content ?? ''));
      else if (m.role === 'user') msgs.push({ role: 'user', content: String(m.content ?? '') });
      else if (m.role === 'assistant') msgs.push({ role: 'assistant', content: String(m.content ?? '') });
    }

    let system = systemChunks.filter(Boolean).join('\n\n').trim();
    if (req.modeConfig.jsonMode) {
      system = `${system ? `${system}\n\n` : ''}Respond with valid JSON only.`.trim();
    }

    const base = (this.opts.baseUrl ?? 'https://api.anthropic.com').replace(/\/$/, '');
    const url = `${base}/v1/messages`;

    const body: Record<string, unknown> = {
      model,
      max_tokens: 8192,
      messages: msgs,
      ...(system ? { system } : {}),
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Anthropic HTTP ${res.status}: ${text.slice(0, 800)}`);
    }
    const json = (await res.json()) as AnthropicResp;
    const parts = Array.isArray(json?.content) ? json.content : [];
    const text = parts
      .filter((p) => p?.type === 'text' && typeof p.text === 'string')
      .map((p) => p.text as string)
      .join('');
    return {
      content: text,
      usage: json.usage,
      raw: json,
    };
  }
}
