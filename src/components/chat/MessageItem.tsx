import { FC, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import Markdown from 'markdown-to-jsx';
import hljs from 'highlight.js';
import 'highlight.js/styles/github-dark.css';
import { Message } from '../../store/modules/chatStore';
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
  const { t } = useTranslation();
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
      (window as any).__cf_toast?.success?.(t('common.copiedTitle'), t('common.copiedBody'));
    } catch {
      (window as any).__cf_toast?.error?.(t('common.copyFailedTitle'), t('common.copyFailedBody'));
    }
  };

  return (
    <div className={isUser ? 'cf-msgItem cf-msgItem--user' : 'cf-msgItem cf-msgItem--assistant'}>
      <div className="cf-msgItem__bubble">
        <div className="cf-msgItem__meta">
          <span className="cf-sub">{isUser ? t('chat.roleYou') : t('chat.roleAssistant')}</span>
          <span className="cf-sub">·</span>
          <span className="cf-sub">{time}</span>
          <div className="cf-msgItem__actions">
            <button className="cf-btn cf-btnGhost cf-btnSmall" onClick={onCopy}>
              {t('common.copy')}
            </button>
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

