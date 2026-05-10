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
  /**
   * 流式：分别推送 reasoning / content，并汇总 tool_calls（供 Plan/Multitask 实时思考展示）。
   * 未实现时引擎回退 chatCompletion。
   */
  agentStreamChatCompletion?(
    req: ChatCompletionRequest,
    handlers: {
      onReasoningDelta?: (text: string) => void;
      onContentDelta?: (text: string) => void;
      signal?: AbortSignal;
    }
  ): Promise<ChatCompletionResult>;
  /** List models if supported (best-effort). */
  listModels?(): Promise<Array<{ id: string; label?: string }>>;
}

