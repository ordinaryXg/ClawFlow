import { FC } from 'react';
import { Typography } from 'antd';
import './chat.css';

const { Text } = Typography;

interface Props {
  content: string | null;
}

const StreamingMessage: FC<Props> = ({ content }) => {
  if (!content) return null;

  return (
    <div className="cf-stream">
      <div className="cf-stream__bubble">
        <div className="cf-stream__meta">
          <Text type="secondary">OpenClaw · 流式输出</Text>
        </div>
        <div className="cf-stream__content">{content}</div>
      </div>
    </div>
  );
};

export default StreamingMessage;

