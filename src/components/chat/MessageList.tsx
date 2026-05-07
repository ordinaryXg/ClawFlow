import { FC, useEffect, useMemo, useRef } from 'react';
import { Message } from '../../store/modules/chatStore';
import MessageItem from './MessageItem';
import './chat.css';

interface Props {
  messages: Message[];
}

const MessageList: FC<Props> = ({ messages }) => {
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const sorted = useMemo(() => {
    return [...messages].sort((a, b) => a.timestamp - b.timestamp);
  }, [messages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [sorted.length]);

  return (
    <div className="cf-msgList">
      {sorted.map((m) => (
        <MessageItem key={m.id} message={m} />
      ))}
      <div ref={bottomRef} />
    </div>
  );
};

export default MessageList;

