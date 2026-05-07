import { FC, useMemo } from 'react';
import { Button, Tooltip, Typography, message as antdMessage } from 'antd';
import { CopyOutlined } from '@ant-design/icons';
import Markdown from 'markdown-to-jsx';
import hljs from 'highlight.js';
import 'highlight.js/styles/github.css';
import { Message } from '../../store/modules/chatStore';
import './chat.css';

const { Text } = Typography;

interface Props {
  message: Message;
}

function safeTextToHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

const MessageItem: FC<Props> = ({ message }) => {
  const isUser = message.role === 'user';

  const time = useMemo(() => {
    try {
      return new Date(message.timestamp).toLocaleTimeString();
    } catch {
      return '';
    }
  }, [message.timestamp]);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      antdMessage.success('已复制');
    } catch {
      antdMessage.error('复制失败');
    }
  };

  return (
    <div className={isUser ? 'cf-msgItem cf-msgItem--user' : 'cf-msgItem cf-msgItem--assistant'}>
      <div className="cf-msgItem__bubble">
        <div className="cf-msgItem__meta">
          <Text type="secondary">{isUser ? '你' : 'OpenClaw'}</Text>
          <Text type="secondary">·</Text>
          <Text type="secondary">{time}</Text>
          <div className="cf-msgItem__actions">
            <Tooltip title="复制">
              <Button size="small" type="text" icon={<CopyOutlined />} onClick={onCopy} />
            </Tooltip>
          </div>
        </div>

        <div className="cf-msgItem__content">
          <Markdown
            options={{
              forceBlock: true,
              overrides: {
                code: {
                  component: ({ className, children, ...props }: any) => {
                    const raw = Array.isArray(children) ? children.join('') : String(children ?? '');
                    const language = typeof className === 'string' ? className.replace('lang-', '').replace('language-', '') : '';

                    const highlighted = (() => {
                      try {
                        if (language && hljs.getLanguage(language)) {
                          return hljs.highlight(raw, { language }).value;
                        }
                        return hljs.highlightAuto(raw).value;
                      } catch {
                        return safeTextToHtml(raw);
                      }
                    })();

                    return (
                      <code
                        {...props}
                        className={className}
                        dangerouslySetInnerHTML={{ __html: highlighted }}
                      />
                    );
                  },
                },
                pre: {
                  component: ({ children, ...props }: any) => (
                    <pre {...props} className="cf-codeBlock">
                      {children}
                    </pre>
                  ),
                },
              },
            }}
          >
            {message.content}
          </Markdown>
        </div>
      </div>
    </div>
  );
};

export default MessageItem;

