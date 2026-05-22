import { FC, useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatUtf8Bytes } from '../../utils/format-bytes';

const SIZE = 28;
const STROKE = 3.5;
const R = (SIZE - STROKE) / 2;
const C = 2 * Math.PI * R;

export type ContextUsageSegment = {
  id: 'role' | 'skills' | 'chat' | 'tools';
  utf8Bytes: number;
  loadUnits: number;
};

interface Props {
  /** 0–1，总占用相对预算 */
  ratio: number;
  usedTokensApprox?: number;
  limitTokensApprox?: number;
  titleOverride?: string;
  budgetUnits?: number;
  segments?: readonly ContextUsageSegment[];
}

const SEG_COLORS: Record<ContextUsageSegment['id'], string> = {
  role: '#8b949e',
  skills: '#3fb950',
  chat: '#58a6ff',
  tools: '#d29922',
};

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function describeArc(cx: number, cy: number, r: number, startAngle: number, endAngle: number): string {
  const start = polarToCartesian(cx, cy, r, endAngle);
  const end = polarToCartesian(cx, cy, r, startAngle);
  const large = endAngle - startAngle <= 180 ? '0' : '1';
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${large} 0 ${end.x} ${end.y}`;
}

const ContextUsageRing: FC<Props> = ({
  ratio,
  usedTokensApprox,
  limitTokensApprox,
  titleOverride,
  budgetUnits,
  segments,
}) => {
  const { t } = useTranslation();
  const gid = useId();
  const [hover, setHover] = useState(false);
  const clamped = Math.min(1, Math.max(0, ratio));
  const budget = Math.max(1, budgetUnits ?? limitTokensApprox ?? 1);

  const arcs = useMemo(() => {
    if (!segments?.length) return null;
    const totalLoad = segments.reduce((s, x) => s + x.loadUnits, 0);
    if (totalLoad <= 0) return null;
    let angle = 0;
    const maxSweep = Math.min(360, (totalLoad / budget) * 360);
    const scale = totalLoad > 0 ? maxSweep / totalLoad : 0;
    return segments.map((seg) => {
      const sweep = seg.loadUnits * scale;
      const start = angle;
      angle += sweep;
      if (sweep < 0.35) return null;
      return {
        id: seg.id,
        d: describeArc(SIZE / 2, SIZE / 2, R, start, start + sweep),
        color: SEG_COLORS[seg.id],
        seg,
      };
    }).filter(Boolean) as Array<{ id: ContextUsageSegment['id']; d: string; color: string; seg: ContextUsageSegment }>;
  }, [budget, segments]);

  const fallbackDash = useMemo(() => C * (1 - clamped), [clamped]);
  const tone =
    clamped >= 0.92 ? 'var(--danger, #f85149)' : clamped >= 0.75 ? 'var(--warn, #d29922)' : 'var(--accent, #3fb950)';

  const usedLoad =
    budgetUnits != null && budgetUnits > 0
      ? Math.ceil(clamped * budgetUnits).toLocaleString()
      : usedTokensApprox != null
        ? usedTokensApprox.toLocaleString()
        : '—';
  const budgetLoad =
    budgetUnits != null
      ? budgetUnits.toLocaleString()
      : limitTokensApprox != null
        ? limitTokensApprox.toLocaleString()
        : '—';

  const title =
    titleOverride?.trim() ||
    t('chat.contextRingTitle', {
      pct: Math.round(clamped * 100),
      used: usedLoad,
      budget: budgetLoad,
    });

  const segLabel = (id: ContextUsageSegment['id']) => t(`chat.contextSeg.${id}`);

  return (
    <div
      className="cf-contextRing"
      aria-label={title}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocus={() => setHover(true)}
      onBlur={() => setHover(false)}
      tabIndex={0}
    >
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} aria-hidden>
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={R}
          fill="none"
          stroke="rgba(255, 255, 255, 0.08)"
          strokeWidth={STROKE}
        />
        {arcs?.length ? (
          arcs.map((a) => (
            <path
              key={a.id}
              d={a.d}
              fill="none"
              stroke={a.color}
              strokeWidth={STROKE}
              strokeLinecap="round"
            />
          ))
        ) : (
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={R}
            fill="none"
            stroke={tone}
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={`${C} ${C}`}
            strokeDashoffset={fallbackDash}
            transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
          />
        )}
      </svg>
      {hover && segments?.length ? (
        <div className="cf-contextRing__pop" role="tooltip" id={`${gid}-ctx-pop`}>
          <div className="cf-contextRing__popTitle">{t('chat.contextRingBreakdownTitle')}</div>
          <ul className="cf-contextRing__popList">
            {segments.map((seg) => {
              const pct = Math.round((seg.loadUnits / budget) * 100);
              return (
                <li key={seg.id} className="cf-contextRing__popRow">
                  <span className="cf-contextRing__popSwatch" style={{ background: SEG_COLORS[seg.id] }} aria-hidden />
                  <span className="cf-contextRing__popLabel">{segLabel(seg.id)}</span>
                  <span className="cf-contextRing__popMeta">
                    {t('chat.contextRingSegLine', {
                      pct,
                      load: seg.loadUnits.toLocaleString(),
                      bytes: formatUtf8Bytes(seg.utf8Bytes),
                    })}
                  </span>
                </li>
              );
            })}
          </ul>
          <div className="cf-contextRing__popFoot">
            <div>{title}</div>
            <div className="cf-contextRing__popNote">{t('chat.contextRingNotBilling')}</div>
          </div>
        </div>
      ) : (
        <span className="cf-contextRing__hint">{t('chat.contextRingNotBilling')}</span>
      )}
    </div>
  );
};

export default ContextUsageRing;
