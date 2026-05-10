import { FC } from 'react';
import Markdown from 'markdown-to-jsx';
import hljs from 'highlight.js';
import 'highlight.js/styles/github-dark.css';
import { Message } from '../../store/modules/chatStore';
import ThinkingBlock from './ThinkingBlock';
import './chat.css';

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

  return (
    <div className={isUser ? 'cf-msgItem cf-msgItem--user' : 'cf-msgItem cf-msgItem--assistant'}>
      <div className="cf-msgItem__bubble">
        {!isUser && message.reasoningContent?.trim() ? (
          <ThinkingBlock text={message.reasoningContent.trim()} streaming={false} />
        ) : null}
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

