import { FC } from 'react';
import './chat.css';

interface Props {
  content: string | null;
}

const StreamingMessage: FC<Props> = ({ content }) => {
  if (!content) return null;

  return (
    <div className="cf-stream">
      <div className="cf-stream__bubble">
        <div className="cf-stream__meta">
          <span className="cf-sub">OpenClaw · 流式输出</span>
        </div>
        <div className="cf-stream__content">{content}</div>
      </div>
    </div>
  );
};

export default StreamingMessage;

