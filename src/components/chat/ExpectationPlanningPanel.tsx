import { FC, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

type Props = {
  planning: boolean;
  streamText: string | null;
  displayMarkdown: string | null;
};

/** M3/M4 前置预期规划：编排过程与结果展示 */
const ExpectationPlanningPanel: FC<Props> = ({ planning, streamText, displayMarkdown }) => {
  const { t } = useTranslation();

  const body = useMemo(() => {
    if (planning && streamText?.trim()) return streamText;
    if (displayMarkdown?.trim()) return displayMarkdown;
    return '';
  }, [planning, streamText, displayMarkdown]);

  if (!planning && !body.trim()) return null;

  return (
    <section className="cf-expectationPlan" aria-live="polite" aria-busy={planning}>
      <header className="cf-expectationPlan__head">
        <span className="cf-expectationPlan__title">{t('chat.expectationPlanTitle')}</span>
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
  );
};

export default ExpectationPlanningPanel;
