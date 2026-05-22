import { FC, useMemo } from 'react';
import {
  CheckOutlined,
  CloseOutlined,
  CloudOutlined,
  CodeOutlined,
  ExperimentOutlined,
  LoadingOutlined,
  ToolOutlined,
} from '@ant-design/icons';

export type ToolStatusKey = 'running' | 'result' | 'error' | string | null;

type Props = {
  kind: string | null;
  statusKey: ToolStatusKey;
  riskLevel?: 'low' | 'medium' | 'high' | null;
  /** 供屏幕阅读器 */
  ariaLabel?: string;
};

function pickKindIcon(kind: string | null) {
  if (!kind) return ToolOutlined;
  if (kind.startsWith('tool.network')) return CloudOutlined;
  if (kind.startsWith('tool.exec')) return CodeOutlined;
  if (kind.startsWith('tool.subagent')) return ExperimentOutlined;
  return ToolOutlined;
}

/** 工具种类 + 运行/完成/失败 + 风险，合并为单一 24px 状态块 */
const ToolStatusGlyph: FC<Props> = ({ kind, statusKey, riskLevel, ariaLabel }) => {
  const KindIcon = useMemo(() => pickKindIcon(kind), [kind]);

  const statusClass =
    statusKey === 'running'
      ? 'cf-toolMsg__glyph--running'
      : statusKey === 'result'
        ? 'cf-toolMsg__glyph--result'
        : statusKey === 'error'
          ? 'cf-toolMsg__glyph--error'
          : 'cf-toolMsg__glyph--idle';

  const riskClass =
    riskLevel === 'high'
      ? 'cf-toolMsg__glyph--riskHigh'
      : riskLevel === 'medium'
        ? 'cf-toolMsg__glyph--riskMed'
        : '';

  return (
    <span
      className={['cf-toolMsg__glyph', statusClass, riskClass].filter(Boolean).join(' ')}
      aria-label={ariaLabel}
      title={ariaLabel}
    >
      <KindIcon className="cf-toolMsg__glyphKind" aria-hidden />
      {statusKey === 'running' ? (
        <LoadingOutlined className="cf-toolMsg__glyphOverlay cf-toolMsg__glyphOverlay--spin" spin aria-hidden />
      ) : null}
      {statusKey === 'result' ? (
        <span className="cf-toolMsg__glyphBadge cf-toolMsg__glyphBadge--ok" aria-hidden>
          <CheckOutlined />
        </span>
      ) : null}
      {statusKey === 'error' ? (
        <span className="cf-toolMsg__glyphBadge cf-toolMsg__glyphBadge--err" aria-hidden>
          <CloseOutlined />
        </span>
      ) : null}
    </span>
  );
};

export default ToolStatusGlyph;
