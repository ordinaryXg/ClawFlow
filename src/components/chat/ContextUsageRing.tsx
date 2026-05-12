import { FC, useId, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

const SIZE = 28;
const STROKE = 3;
const R = (SIZE - STROKE) / 2;
const C = 2 * Math.PI * R;

interface Props {
  /** 0–1 */
  ratio: number;
  usedTokensApprox?: number;
  limitTokensApprox?: number;
}

const ContextUsageRing: FC<Props> = ({ ratio, usedTokensApprox, limitTokensApprox }) => {
  const { t } = useTranslation();
  const gid = useId();
  const clamped = Math.min(1, Math.max(0, ratio));
  const dash = useMemo(() => C * (1 - clamped), [clamped]);
  const tone =
    clamped >= 0.92 ? 'var(--danger, #f85149)' : clamped >= 0.75 ? 'var(--warn, #d29922)' : 'var(--accent, #3fb950)';
  const title = t('chat.contextRingTitle', {
    pct: Math.round(clamped * 100),
    used: usedTokensApprox != null ? `~${usedTokensApprox.toLocaleString()}` : '—',
    limit: limitTokensApprox != null ? limitTokensApprox.toLocaleString() : '—',
  });

  return (
    <div className="cf-contextRing" title={title} aria-label={title}>
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} aria-hidden>
        <defs>
          <linearGradient id={`${gid}-ctx`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={tone} stopOpacity={0.95} />
            <stop offset="100%" stopColor={tone} stopOpacity={0.55} />
          </linearGradient>
        </defs>
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={R}
          fill="none"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth={STROKE}
        />
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={R}
          fill="none"
          stroke={`url(#${gid}-ctx)`}
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={`${C} ${C}`}
          strokeDashoffset={dash}
          transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
        />
      </svg>
    </div>
  );
};

export default ContextUsageRing;
