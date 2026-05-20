import { FC, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Markdown from 'markdown-to-jsx';
import { DownOutlined, ExperimentOutlined, RightOutlined } from '@ant-design/icons';
import type { Message } from '../../store/modules/chatStore';
import { evolutionSegment, evolutionStatus } from './evolution-message-metadata';
import './chat.css';

const SEGMENT_ORDER = ['dispatch', 'memory', 'skills', 'role_doc', 'summary'] as const;

const EvolutionMessageGroup: FC<{ messages: Message[] }> = ({ messages }) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(true);

  const sorted = useMemo(
    () =>
      [...messages].sort((a, b) => {
        const ai = SEGMENT_ORDER.indexOf(evolutionSegment(a) as (typeof SEGMENT_ORDER)[number]);
        const bi = SEGMENT_ORDER.indexOf(evolutionSegment(b) as (typeof SEGMENT_ORDER)[number]);
        const ao = ai >= 0 ? ai : SEGMENT_ORDER.length;
        const bo = bi >= 0 ? bi : SEGMENT_ORDER.length;
        if (ao !== bo) return ao - bo;
        return a.timestamp - b.timestamp;
      }),
    [messages]
  );

  const aggregateStatus = useMemo(() => {
    let running = false;
    let failed = false;
    for (const m of sorted) {
      const st = evolutionStatus(m);
      if (st === 'running') running = true;
      if (st === 'failed') failed = true;
    }
    if (running) return 'running' as const;
    if (failed) return 'failed' as const;
    return 'ok' as const;
  }, [sorted]);

  const manual = Boolean(sorted[0]?.meta?.manual);
  const lastMeta = sorted[sorted.length - 1]?.meta;
  const diffCount = typeof lastMeta?.diffCount === 'number' ? lastMeta.diffCount : undefined;

  const statusLabel =
    aggregateStatus === 'running'
      ? t('chat.evolutionMessage.statusRunning')
      : aggregateStatus === 'failed'
        ? t('chat.evolutionMessage.statusFailed')
        : t('chat.evolutionMessage.statusOk');

  const segmentLabel = (seg: string) => {
    if (seg === 'dispatch') return t('chat.evolutionMessage.segmentDispatch');
    if (seg === 'summary') return t('chat.evolutionMessage.segmentSummary');
    const key = `skills.evolutionRuns.aspect.${seg}`;
    const translated = t(key);
    return translated !== key ? translated : seg;
  };

  return (
    <div className="cf-msgItem cf-msgItem--assistant cf-msgItem--evolution">
      <button
        type="button"
        className="cf-evolutionMsg__head"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="cf-evolutionMsg__badge">{t('chat.evolutionMessage.badge')}</span>
        <ExperimentOutlined className="cf-evolutionMsg__icon" aria-hidden />
        <span className="cf-evolutionMsg__title">
          {manual ? t('chat.evolutionMessage.titleManual') : t('chat.evolutionMessage.titleAuto')}
        </span>
        <span className={`cf-evolutionMsg__status cf-evolutionMsg__status--${aggregateStatus}`}>{statusLabel}</span>
        {typeof diffCount === 'number' && diffCount > 0 ? (
          <span className="cf-evolutionMsg__diffCount">{t('chat.evolutionMessage.diffCount', { count: diffCount })}</span>
        ) : null}
        <span className="cf-evolutionMsg__chev" aria-hidden>
          {open ? <DownOutlined /> : <RightOutlined />}
        </span>
      </button>
      {open ? (
        <div className="cf-evolutionMsg__body">
          {sorted.map((m) => {
            const seg = evolutionSegment(m);
            const body = String(m.content ?? '').trim();
            if (!body) return null;
            return (
              <section key={m.id} className="cf-evolutionMsg__section">
                <div className="cf-evolutionMsg__sectionTitle">{segmentLabel(seg)}</div>
                <div className="cf-msgItem__content cf-evolutionMsg__content">
                  <Markdown options={{ forceBlock: true }}>{body}</Markdown>
                </div>
              </section>
            );
          })}
        </div>
      ) : null}
    </div>
  );
};

export default EvolutionMessageGroup;
