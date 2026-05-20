import type { Message } from '../../store/modules/chatStore';
import { evolutionMergeGroupKey } from './evolution-message-metadata';
import { toolMergeGroupKey } from './tool-message-metadata';

export type MessageListRow =
  | { type: 'single'; message: Message }
  | { type: 'toolGroup'; key: string; messages: Message[] }
  | { type: 'evolutionGroup'; key: string; messages: Message[] };

export function buildGroupedRows(sorted: Message[]): MessageListRow[] {
  const rows: MessageListRow[] = [];
  let i = 0;
  while (i < sorted.length) {
    const m = sorted[i];
    if (!m) break;
    const evoKey = evolutionMergeGroupKey(m);
    if (evoKey) {
      const group: Message[] = [m];
      let j = i + 1;
      while (j < sorted.length) {
        const n = sorted[j];
        if (!n) break;
        if (evolutionMergeGroupKey(n) === evoKey) {
          group.push(n);
          j += 1;
        } else {
          break;
        }
      }
      const head = group[0];
      const headId = head ? head.id : 'unknown';
      rows.push({ type: 'evolutionGroup', key: `${evoKey}:${headId}`, messages: group });
      i = j;
      continue;
    }
    if (m.role !== 'tool') {
      rows.push({ type: 'single', message: m });
      i += 1;
      continue;
    }
    const key = toolMergeGroupKey(m);
    if (!key) {
      rows.push({ type: 'single', message: m });
      i += 1;
      continue;
    }
    const group: Message[] = [m];
    let j = i + 1;
    while (j < sorted.length) {
      const n = sorted[j];
      if (!n) break;
      if (n.role === 'tool' && toolMergeGroupKey(n) === key) {
        group.push(n);
        j += 1;
      } else {
        break;
      }
    }
    if (group.length >= 2) {
      const head = group[0];
      const headId = head ? head.id : 'unknown';
      rows.push({ type: 'toolGroup', key: `${key}:${headId}`, messages: group });
    } else {
      rows.push({ type: 'single', message: m });
    }
    i = j;
  }
  return rows;
}

function approxMessageChars(m: Message): number {
  return String(m.content ?? '').length + String(m.reasoningContent ?? '').length;
}

export function approxRowChars(row: MessageListRow): number {
  if (row.type === 'single') return approxMessageChars(row.message);
  if (row.type === 'evolutionGroup' || row.type === 'toolGroup') {
    return row.messages.reduce((acc, m) => acc + approxMessageChars(m), 0);
  }
  return 0;
}

/**
 * 自末尾起最多包含 maxRows 行，且累计正文长度不超过 maxChars（至少保留最后一行）。
 */
export function computeTailWindowStart(rows: MessageListRow[], maxRows: number, maxChars: number): number {
  if (rows.length === 0) return 0;
  const capRows = Math.max(1, Math.floor(maxRows));
  const capChars = Math.max(1000, Math.floor(maxChars));
  const last = rows[rows.length - 1];
  if (!last) return 0;
  let start = rows.length - 1;
  let chars = approxRowChars(last);
  for (let i = rows.length - 2; i >= 0; i--) {
    if (rows.length - 1 - i >= capRows) break;
    const row = rows[i];
    if (!row) break;
    const c = approxRowChars(row);
    if (chars + c > capChars) break;
    chars += c;
    start = i;
  }
  return start;
}
