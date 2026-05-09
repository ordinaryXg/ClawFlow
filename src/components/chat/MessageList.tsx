import { FC, useMemo } from 'react';
import { Message } from '../../store/modules/chatStore';
import MessageItem from './MessageItem';
import './chat.css';

interface Props {
  messages: Message[];
}

const MessageList: FC<Props> = ({ messages }) => {
  const sorted = useMemo(() => {
    return [...messages].sort((a, b) => a.timestamp - b.timestamp);
  }, [messages]);

  return (
    <div className="cf-msgList">
      {sorted.map((m) => (
        <MessageItem key={m.id} message={m} />
      ))}
    </div>
  );
};

export default MessageList;

