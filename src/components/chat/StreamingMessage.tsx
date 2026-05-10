import { FC } from 'react';
import { useTranslation } from 'react-i18next';
import ThinkingBlock from './ThinkingBlock';
import './chat.css';

interface Props {
  activity: string | null;
  thinking: string | null;
}

const StreamingMessage: FC<Props> = ({ activity, thinking }) => {
  const { t } = useTranslation();
  if (activity === null && thinking === null) return null;

  const act = activity ?? '';
  const hasThinking = Boolean(thinking?.trim());
  const hasActivity = act.trim().length > 0;
  /** 思考流结束后（正文或工具日志进入 activity）收折为一行 */
  const compactThinking = hasThinking && hasActivity;

  if (!hasThinking && !hasActivity) {
    return (
      <div className="cf-stream">
        <div className="cf-stream__bubble">
          <div className="cf-stream__meta">
            <span className="cf-sub">
              {t('chat.streamLabel')} · {t('chat.streamGenerating')}
            </span>
          </div>
          <div className="cf-stream__content cf-stream__content--muted">{'\u00a0'}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="cf-stream">
      <div className="cf-stream__bubble">
        <div className="cf-stream__meta">
          <span className="cf-sub">
            {t('chat.streamLabel')} · {t('chat.streamGenerating')}
          </span>
        </div>
        {hasThinking && thinking ? (
          <div className="cf-stream__thinking">
            <ThinkingBlock
              key={compactThinking ? 'think-compact' : 'think-expand'}
              text={thinking}
              streaming={!compactThinking}
            />
          </div>
        ) : null}
        {hasActivity ? <div className="cf-stream__content cf-stream__content--activity">{act}</div> : null}
      </div>
    </div>
  );
};

export default StreamingMessage;
