/**
 * OpenAI-compatible SSE stream (used by DeepSeek streaming chat/completions).
 */

export async function readOpenAiSseContentStream(
  body: ReadableStream<Uint8Array> | null | undefined,
  onDelta: (text: string) => void
): Promise<void> {
  if (!body) throw new Error('Streaming response has no body');

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let lineBuffer = '';

  const processLine = (line: string) => {
    const t = line.trim();
    if (!t.startsWith('data:')) return;
    const payload = t.slice(5).trim();
    if (payload === '[DONE]') return;
    try {
      const j = JSON.parse(payload) as {
        choices?: Array<{ delta?: { content?: string | null } }>;
      };
      const c = j?.choices?.[0]?.delta?.content;
      if (typeof c === 'string' && c.length) onDelta(c);
    } catch {
      // ignore malformed chunk
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
}
