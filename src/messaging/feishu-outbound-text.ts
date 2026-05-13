import { mergeCompletionReasoning } from '../utils/split-reasoning-from-content';
import { STREAM_REASONING_END, STREAM_REASONING_START } from '../utils/reasoning-stream-demux';

/**
 * 回发飞书等外部渠道：仅保留对用户可见的正文，去掉思考块标记与 JSON 内嵌思考拆分后的 reasoning。
 */
export function formatAssistantReplyForFeishu(raw: string): string {
  let s = String(raw ?? '').trim();
  if (!s) return '';
  const merged = mergeCompletionReasoning(s, undefined);
  s = merged.displayContent.trim() || s;
  const START = STREAM_REASONING_START;
  const END = STREAM_REASONING_END;
  let out = '';
  let i = 0;
  while (i < s.length) {
    const a = s.indexOf(START, i);
    if (a === -1) {
      out += s.slice(i);
      break;
    }
    out += s.slice(i, a);
    const b = s.indexOf(END, a + START.length);
    if (b === -1) break;
    i = b + END.length;
  }
  return out.replace(/\r\n/g, '\n').trim();
}
