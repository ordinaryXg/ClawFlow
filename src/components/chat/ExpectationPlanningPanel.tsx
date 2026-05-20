import { FC, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ScheduleOutlined } from '@ant-design/icons';

type Props = {
  planning: boolean;
  streamText: string | null;
  displayMarkdown: string | null;
  /** 如 M3 / M4，用于与主对话气泡区分 */
  categoryLabel?: string | null;
};

/** M3/M4 前置预期规划：锚定在本轮用户消息之后展示 */
const ExpectationPlanningPanel: FC<Props> = ({ planning, streamText, displayMarkdown, categoryLabel }) => {
  const { t } = useTranslation();

  const body = useMemo(() => {
    if (planning && streamText?.trim()) return streamText;
    if (displayMarkdown?.trim()) return displayMarkdown;
    return '';
  }, [planning, streamText, displayMarkdown]);

  if (!planning && !body.trim()) return null;

  const category = String(categoryLabel ?? '').trim();

  return (
    <div className="cf-expectationPlanWrap" role="region" aria-label={t('chat.expectationPlanTitle')}>
      <section className="cf-expectationPlan" aria-live="polite" aria-busy={planning}>
        <header className="cf-expectationPlan__head">
          <span className="cf-expectationPlan__icon" aria-hidden>
            <ScheduleOutlined />
          </span>
          <div className="cf-expectationPlan__headText">
            <span className="cf-expectationPlan__kicker">{t('chat.expectationPlanKicker')}</span>
            <span className="cf-expectationPlan__title">{t('chat.expectationPlanTitle')}</span>
          </div>
          {category ? <span className="cf-expectationPlan__category">{category}</span> : null}
          {planning ? <span className="cf-expectationPlan__badge">{t('chat.expectationPlanRunning')}</span> : null}
        </header>
        <div className="cf-expectationPlan__body">
          {body.trim() ? (
            <pre className="cf-expectationPlan__pre">{body}</pre>
          ) : planning ? (
            <div className="cf-stream__typingDots" aria-hidden>
              <span />
              <span />
              <span />
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
};

export default ExpectationPlanningPanel;
