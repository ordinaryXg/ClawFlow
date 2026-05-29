import { FC, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import Markdown from 'markdown-to-jsx';
import hljs from 'highlight.js';
import {
  BranchesOutlined,
  CommentOutlined,
  ExperimentOutlined,
  InfoCircleOutlined,
  ScheduleOutlined,
  ToolOutlined,
} from '@ant-design/icons';
import 'highlight.js/styles/github-dark.css';
import {
  Message,
  MessageChannel,
  resolveMessagePresentationChannel,
  shouldShowMessageChannelStrip,
} from '../../store/modules/chatStore';
import ThinkingBlock from './ThinkingBlock';
import ToolMessageItem from './ToolMessageItem';
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

function channelSlug(ch: MessageChannel): string {
  return ch.replace(/_/g, '-');
}

const MessageItem: FC<Props> = ({ message }) => {
  const { t } = useTranslation();
  if (message.role === 'tool') {
    return <ToolMessageItem message={message} />;
  }
  const isUser = message.role === 'user';
  const ch = resolveMessagePresentationChannel(message);
  const strip = shouldShowMessageChannelStrip(message);

  let stripIcon: ReactNode = null;
  switch (ch) {
    case 'user_feishu':
      stripIcon = <CommentOutlined className="cf-msgItem__chIcon" aria-hidden />;
      break;
    case 'user_scheduling_auto':
      stripIcon = <ScheduleOutlined className="cf-msgItem__chIcon" aria-hidden />;
      break;
    case 'user_tool_delegate':
      stripIcon = <ToolOutlined className="cf-msgItem__chIcon" aria-hidden />;
      break;
    case 'user_workflow':
      stripIcon = <BranchesOutlined className="cf-msgItem__chIcon" aria-hidden />;
      break;
    case 'user_system':
      stripIcon = <InfoCircleOutlined className="cf-msgItem__chIcon" aria-hidden />;
      break;
    case 'assistant_tool_summary':
      stripIcon = <ExperimentOutlined className="cf-msgItem__chIcon" aria-hidden />;
      break;
    default:
      break;
  }

  const stripLabel = strip ? t(`chat.messageChannel.${ch}`) : null;

  return (
    <div
      className={`cf-msgItem ${isUser ? 'cf-msgItem--user' : 'cf-msgItem--assistant'} cf-msgItem--ch-${channelSlug(
        ch
      )}`}
    >
      {strip && stripIcon ? (
        <div className="cf-msgItem__strip" aria-label={stripLabel ?? undefined}>
          {stripIcon}
          <span className="cf-msgItem__stripText">{stripLabel}</span>
        </div>
      ) : null}
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
                    const language =
                      typeof className === 'string' ? className.replace('lang-', '').replace('language-', '') : '';

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
