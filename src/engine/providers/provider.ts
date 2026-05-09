import type { ChatCompletionRequest, ChatCompletionResult } from './types';

export interface ModelProvider {
  /** Provider id used in model ids, e.g. `deepseek/xxx` */
  id: string;
  /** Execute one chat completion. Implementations should be stateless. */
  chatCompletion(req: ChatCompletionRequest, opts?: { signal?: AbortSignal }): Promise<ChatCompletionResult>;
  /** OpenAI-compatible streaming; optional — fallback is non-streaming + single onDelta. */
  streamChatCompletion?(
    req: ChatCompletionRequest,
    onDelta: (text: string) => void,
    opts?: { signal?: AbortSignal }
  ): Promise<ChatCompletionResult>;
  /** List models if supported (best-effort). */
  listModels?(): Promise<Array<{ id: string; label?: string }>>;
}

