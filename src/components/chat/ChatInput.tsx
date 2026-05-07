import { FC, useEffect, useMemo, useState } from 'react';
import { Button, Input } from 'antd';
import { SendOutlined } from '@ant-design/icons';
import './chat.css';

interface Props {
  disabled?: boolean;
  onSend: (content: string) => Promise<void> | void;
}

const ChatInput: FC<Props> = ({ disabled, onSend }) => {
  const [value, setValue] = useState('');
  const [isSending, setIsSending] = useState(false);

  const canSend = useMemo(() => {
    return !disabled && !isSending && value.trim().length > 0;
  }, [disabled, isSending, value]);

  useEffect(() => {
    if (disabled) setIsSending(false);
  }, [disabled]);

  const submit = async () => {
    if (!canSend) return;
    const content = value.trim();
    setValue('');
    setIsSending(true);
    try {
      await onSend(content);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="cf-chatInput">
      <Input.TextArea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="输入消息，Enter 发送，Shift+Enter 换行"
        autoSize={{ minRows: 2, maxRows: 8 }}
        disabled={disabled || isSending}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            void submit();
          }
        }}
      />
      <div className="cf-chatInput__actions">
        <Button
          type="primary"
          icon={<SendOutlined />}
          onClick={() => void submit()}
          disabled={!canSend}
          loading={isSending}
        >
          发送
        </Button>
      </div>
    </div>
  );
};

export default ChatInput;

