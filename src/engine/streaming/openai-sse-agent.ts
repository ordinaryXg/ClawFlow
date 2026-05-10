/**
 * OpenAI 兼容 SSE：同时消费 delta.content / delta.reasoning_content，并合并流式 tool_calls。
 */

import type { ChatCompletionResult, ToolCall } from '../providers/types';

type SseDeltaTool = {
  index?: number;
  id?: string;
  type?: string;
  function?: { name?: string; arguments?: string };
};

type AgentStreamHandlers = {
  onReasoningDelta?: (text: string) => void;
  onContentDelta?: (text: string) => void;
};

function mergeToolCallDelta(
  acc: Map<number, { id: string; name: string; args: string }>,
  deltas: SseDeltaTool[] | undefined
): void {
  if (!deltas?.length) return;
  for (const tc of deltas) {
    const idx = typeof tc.index === 'number' ? tc.index : 0;
    const cur = acc.get(idx) ?? { id: '', name: '', args: '' };
    if (tc.id) cur.id = tc.id;
    if (tc.function?.name) cur.name = tc.function.name;
    if (tc.function?.arguments) cur.args += tc.function.arguments;
    acc.set(idx, cur);
  }
}

function toolAccToCalls(acc: Map<number, { id: string; name: string; args: string }>): ToolCall[] | null {
  if (acc.size === 0) return null;
  const out: ToolCall[] = [];
  for (const [, v] of [...acc.entries()].sort((a, b) => a[0] - b[0])) {
    const name = v.name.trim();
    if (!name) continue;
    out.push({
      id: v.id || `call_${name}_${out.length}`,
      type: 'function',
      function: { name, arguments: v.args || '{}' },
    });
  }
  return out.length ? out : null;
}

export async function readOpenAiSseAgentStream(
  body: ReadableStream<Uint8Array> | null | undefined,
  handlers: AgentStreamHandlers
): Promise<ChatCompletionResult> {
  if (!body) throw new Error('Streaming response has no body');

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let lineBuffer = '';

  let content = '';
  let reasoning = '';
  const toolAcc = new Map<number, { id: string; name: string; args: string }>();
  let usage: ChatCompletionResult['usage'];

  const processLine = (line: string) => {
    const t = line.trim();
    if (!t.startsWith('data:')) return;
    const payload = t.slice(5).trim();
    if (payload === '[DONE]') return;
    try {
      const j = JSON.parse(payload) as {
        usage?: ChatCompletionResult['usage'];
        choices?: Array<{
          finish_reason?: string | null;
          delta?: {
            content?: string | null;
            reasoning_content?: string | null;
            tool_calls?: SseDeltaTool[];
          };
        }>;
      };
      if (j.usage) usage = j.usage;
      const choice = j?.choices?.[0];
      const delta = choice?.delta;
      if (!delta) return;

      const r = delta.reasoning_content;
      if (typeof r === 'string' && r.length) {
        reasoning += r;
        handlers.onReasoningDelta?.(r);
      }
      const c = delta.content;
      if (typeof c === 'string' && c.length) {
        content += c;
        handlers.onContentDelta?.(c);
      }
      mergeToolCallDelta(toolAcc, delta.tool_calls);
    } catch {
      /* ignore malformed chunk */
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    lineBuffer += decoder.decode(value, { stream: true });
    const parts = lineBuffer.split('\n');
    lineBuffer = parts.pop() ?? '';
    for (const line of parts) processLine(line);
  }
  if (lineBuffer.trim()) {
    for (const line of lineBuffer.split('\n')) processLine(line);
  }

  const tool_calls = toolAccToCalls(toolAcc);
  const result: ChatCompletionResult = {
    content,
    ...(reasoning.trim() ? { reasoning_content: reasoning } : {}),
    ...(tool_calls ? { tool_calls } : {}),
    ...(usage ? { usage } : {}),
    raw: { streamed: true, agent: true },
  };
  return result;
}
