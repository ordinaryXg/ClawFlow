export type ChatRole = 'system' | 'user' | 'assistant' | 'tool';

export type ChatMessage = {
  role: ChatRole;
  content: string;
  name?: string;
  // DeepSeek thinking mode field (when applicable)
  reasoning_content?: string;
  // Tool calls (OpenAI-compatible)
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  // Beta: prefix completion
  prefix?: boolean;
};

export type ToolCall = {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
};

export type ToolSchema = {
  type: 'function';
  function: {
    name: string;
    description?: string;
    strict?: boolean;
    parameters: Record<string, unknown>;
  };
};

export type Usage = Record<string, unknown> & {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  prompt_cache_hit_tokens?: number;
  prompt_cache_miss_tokens?: number;
};

export type ChatCompletionResult = {
  content: string;
  reasoning_content?: string;
  tool_calls?: ToolCall[] | null;
  usage?: Usage;
  raw?: unknown;
};

export type InteractionMode = 'ask' | 'plan' | 'multitask';

export type ModeConfig = {
  mode: InteractionMode;
  // DeepSeek thinking mode toggles (sent as top-level `thinking` / `reasoning_effort` in chat/completions)
  thinking?: { type: 'enabled' | 'disabled' };
  reasoning_effort?: 'high' | 'max';
  // When using JSON Mode
  jsonMode?: boolean;
  // Tool calls
  tools?: ToolSchema[];
  /** 是否允许注入工具 schema（由 mode-policy / 用户覆盖决定） */
  toolsEnabled?: boolean;
  // Beta flags
  useBetaBaseUrl?: boolean;
};

export type ChatCompletionRequest = {
  model: string;
  messages: ChatMessage[];
  modeConfig: ModeConfig;
};

