import { FC, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { LoadingOutlined, ToolOutlined } from '@ant-design/icons';
import ThinkingBlock from './ThinkingBlock';
import type { StreamToolHint } from '../../utils/stream-activity-sanitize';
import './chat.css';

interface Props {
  activity: string | null;
  thinking: string | null;
  toolHints?: StreamToolHint[];
}

const StreamingMessage: FC<Props> = ({ activity, thinking, toolHints = [] }) => {
  const { t } = useTranslation();
  const runningTools = useMemo(
    () => toolHints.filter((h) => h.phase === 'start'),
    [toolHints]
  );

  if (activity === null && thinking === null && runningTools.length === 0) return null;

  const act = activity ?? '';
  const hasThinking = Boolean(thinking?.trim());
  const hasActivity = act.trim().length > 0;
  const hasRunningTools = runningTools.length > 0;
  /** 思考流结束后（正文或工具日志进入 activity）收折为一行 */
  const compactThinking = hasThinking && (hasActivity || hasRunningTools);

  if (!hasThinking && !hasActivity && !hasRunningTools) {
    return (
      <div className="cf-stream" aria-busy="true" aria-label={t('chat.streamGenerating')}>
        <div className="cf-stream__bubble">
          <div className="cf-stream__typingDots" aria-hidden>
            <span />
            <span />
            <span />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="cf-stream" aria-busy="true" aria-label={t('chat.streamGenerating')}>
      <div className="cf-stream__bubble">
        {hasThinking && thinking ? (
          <div className="cf-stream__thinking">
            <ThinkingBlock
              key={compactThinking ? 'think-compact' : 'think-expand'}
              text={thinking}
              streaming={!compactThinking}
            />
          </div>
        ) : null}
        {hasRunningTools ? (
          <div className="cf-stream__tools" aria-live="polite">
            {runningTools.map((h) => (
              <div key={h.name} className="cf-stream__toolChip">
                <ToolOutlined className="cf-stream__toolChipIcon" aria-hidden />
                <LoadingOutlined className="cf-stream__toolChipSpin" spin aria-hidden />
                <span className="cf-stream__toolChipLabel">
                  {t('chat.streamToolRunning', { name: h.name })}
                </span>
              </div>
            ))}
          </div>
        ) : null}
        {hasActivity ? <div className="cf-stream__content cf-stream__content--activity">{act}</div> : null}
      </div>
    </div>
  );
};

export default StreamingMessage;
