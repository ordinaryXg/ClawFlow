import { FC, useMemo } from 'react';
import { Message } from '../../store/modules/chatStore';
import MessageItem from './MessageItem';
import ToolMessageGroup from './ToolMessageGroup';
import { toolMergeGroupKey } from './tool-message-metadata';
import './chat.css';

interface Props {
  messages: Message[];
}

type Row = { type: 'single'; message: Message } | { type: 'toolGroup'; key: string; messages: Message[] };

function buildGroupedRows(sorted: Message[]): Row[] {
  const rows: Row[] = [];
  let i = 0;
  while (i < sorted.length) {
    const m = sorted[i]!;
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
      const n = sorted[j]!;
      if (n.role === 'tool' && toolMergeGroupKey(n) === key) {
        group.push(n);
        j += 1;
      } else {
        break;
      }
    }
    if (group.length >= 2) {
      rows.push({ type: 'toolGroup', key: `${key}:${group[0]!.id}`, messages: group });
    } else {
      rows.push({ type: 'single', message: m });
    }
    i = j;
  }
  return rows;
}

const MessageList: FC<Props> = ({ messages }) => {
  const sorted = useMemo(() => {
    return [...messages].sort((a, b) => a.timestamp - b.timestamp);
  }, [messages]);

  const rows = useMemo(() => buildGroupedRows(sorted), [sorted]);

  return (
    <div className="cf-msgList">
      {rows.map((row) =>
        row.type === 'single' ? (
          <MessageItem key={row.message.id} message={row.message} />
        ) : (
          <ToolMessageGroup key={row.key} messages={row.messages} />
        )
      )}
    </div>
  );
};

export default MessageList;
