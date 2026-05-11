import { FC, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ToolApprovalPendingState } from '../../store/modules/chatStore';

type Props = {
  pending: ToolApprovalPendingState;
  onRespond: (approved: boolean) => void;
};

const ToolApprovalBar: FC<Props> = ({ pending, onRespond }) => {
  const { t } = useTranslation();
  const [now, setNow] = useState(() => Date.now());
  const firedRef = useRef(false);

  const deadline = useMemo(() => pending.startedAt + pending.timeoutMs, [pending.startedAt, pending.timeoutMs]);
  const remainingMs = Math.max(0, deadline - now);
  const progress = pending.timeoutMs > 0 ? Math.max(0, Math.min(1, remainingMs / pending.timeoutMs)) : 0;

  useEffect(() => {
    firedRef.current = false;
    setNow(Date.now());
  }, [pending.approvalId]);

  useEffect(() => {
    const tick = () => setNow(Date.now());
    const id = window.setInterval(tick, 100);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (remainingMs > 0) return;
    if (firedRef.current) return;
    firedRef.current = true;
    onRespond(Boolean(pending.defaultApproved));
  }, [onRespond, pending.defaultApproved, remainingMs]);

  const riskLabel = pending.riskLevel === 'high' ? t('chat.toolApproval.riskHigh', { defaultValue: '高风险' }) : t('chat.toolApproval.riskMedium', { defaultValue: '中风险' });
  const defaultLabel = pending.defaultApproved
    ? t('chat.toolApproval.defaultApprove', { defaultValue: '超时默认执行' })
    : t('chat.toolApproval.defaultDeny', { defaultValue: '超时默认不执行' });
  const secondsLeft = Math.ceil(remainingMs / 1000);

  return (
    <div className="cf-toolApproval" role="region" aria-label={t('chat.toolApproval.aria')}>
      <div className="cf-toolApproval__title">{t('chat.toolApproval.title')}</div>
      <p className="cf-toolApproval__hint">
        {t('chat.toolApproval.hint')}（{riskLabel} · {defaultLabel} · {secondsLeft}s）
      </p>
      <ul className="cf-toolApproval__list">
        {pending.tools.map((tool, i) => (
          <li key={`${pending.approvalId}-${i}`} className="cf-toolApproval__item">
            <code className="cf-toolApproval__name">{tool.name}</code>
            {tool.argumentsPreview ? (
              <span className="cf-toolApproval__args" title={tool.argumentsPreview}>
                {tool.argumentsPreview}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
      <div className="cf-toolApproval__actions">
        <button type="button" className="cf-btn cf-btnGhost cf-btnSmall" onClick={() => onRespond(false)}>
          {t('chat.toolApproval.cancel')}
        </button>
        <button type="button" className="cf-btn cf-btnPrimary cf-btnSmall" onClick={() => onRespond(true)}>
          {t('chat.toolApproval.continue')}
        </button>
      </div>
      <div className="cf-toolApproval__countdown" aria-hidden>
        <div className="cf-toolApproval__countdownFill" style={{ width: `${Math.round(progress * 100)}%` }} />
      </div>
    </div>
  );
};

export default ToolApprovalBar;
