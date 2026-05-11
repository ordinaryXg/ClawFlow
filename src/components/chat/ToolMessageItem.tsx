import { FC, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CheckCircleFilled,
  CloudOutlined,
  CodeOutlined,
  ExclamationCircleFilled,
  ExperimentOutlined,
  ToolOutlined,
  WarningFilled,
} from '@ant-design/icons';
import type { Message } from '../../store/modules/chatStore';
import './chat.css';

function coerceString(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

function pickToolKind(meta: Record<string, unknown> | undefined): string | null {
  const kind = coerceString(meta?.kind);
  if (kind) return kind;
  // 兼容：未来可能写入 toolKind/tool_kind
  return coerceString(meta?.toolKind) ?? coerceString(meta?.tool_kind);
}

function pickRiskLevel(meta: Record<string, unknown> | undefined): 'low' | 'medium' | 'high' | null {
  const r = coerceString(meta?.riskLevel) ?? coerceString(meta?.risk_level) ?? coerceString(meta?.risk);
  if (r === 'low' || r === 'medium' || r === 'high') return r;
  return null;
}

function summarize(content: string, maxLen: number): string {
  const oneLine = String(content ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!oneLine) return '';
  if (oneLine.length <= maxLen) return oneLine;
  return `${oneLine.slice(0, maxLen - 1)}…`;
}

const ToolMessageItem: FC<{ message: Message }> = ({ message }) => {
  const { t } = useTranslation();

  const meta = message.meta;
  const kind = useMemo(() => pickToolKind(meta), [meta]);
  const riskLevel = useMemo(() => pickRiskLevel(meta), [meta]);
  const title = useMemo(() => {
    const mt = coerceString(meta?.title);
    if (mt) return mt;
    if (kind) return kind;
    if (message.toolCallId) return `tool_call:${message.toolCallId}`;
    return t('chat.toolMessage.title', { defaultValue: '工具调用' });
  }, [kind, message.toolCallId, meta, t]);

  const status = useMemo(() => coerceString(meta?.status), [meta]);
  const summary = useMemo(() => summarize(message.content, 140), [message.content]);

  const riskIcon = useMemo(() => {
    if (riskLevel === 'high') return <ExclamationCircleFilled className="cf-toolMsg__risk cf-toolMsg__risk--high" />;
    if (riskLevel === 'medium') return <WarningFilled className="cf-toolMsg__risk cf-toolMsg__risk--medium" />;
    if (riskLevel === 'low') return <CheckCircleFilled className="cf-toolMsg__risk cf-toolMsg__risk--low" />;
    return null;
  }, [riskLevel]);

  const icon = useMemo(() => {
    if (!kind) return <ToolOutlined className="cf-toolMsg__icon" aria-hidden />;
    if (kind.startsWith('tool.network')) return <CloudOutlined className="cf-toolMsg__icon" aria-hidden />;
    if (kind.startsWith('tool.exec')) return <CodeOutlined className="cf-toolMsg__icon" aria-hidden />;
    if (kind.startsWith('tool.subagent')) return <ExperimentOutlined className="cf-toolMsg__icon" aria-hidden />;
    return <ToolOutlined className="cf-toolMsg__icon" aria-hidden />;
  }, [kind]);

  const metaJson = useMemo(() => {
    if (!meta) return '';
    try {
      return JSON.stringify(meta, null, 2);
    } catch {
      return '';
    }
  }, [meta]);

  return (
    <div className="cf-toolMsg">
      <details className="cf-toolMsg__details">
        <summary className="cf-toolMsg__summary">
          {icon}
          {riskIcon}
          <span className="cf-toolMsg__title">{title}</span>
          {status ? <span className={`cf-toolMsg__status cf-toolMsg__status--${status}`}>{status}</span> : null}
          {summary ? <span className="cf-toolMsg__oneLine">{summary}</span> : null}
        </summary>
        <div className="cf-toolMsg__body">
          {message.toolCallId ? (
            <div className="cf-toolMsg__kv">
              <span className="cf-toolMsg__k">tool_call_id</span>
              <span className="cf-toolMsg__v">{message.toolCallId}</span>
            </div>
          ) : null}
          {metaJson ? (
            <div className="cf-toolMsg__section">
              <div className="cf-toolMsg__sectionTitle">meta</div>
              <pre className="cf-toolMsg__pre">{metaJson}</pre>
            </div>
          ) : null}
          <div className="cf-toolMsg__section">
            <div className="cf-toolMsg__sectionTitle">content</div>
            <pre className="cf-toolMsg__pre">{String(message.content ?? '')}</pre>
          </div>
        </div>
      </details>
    </div>
  );
};

export default ToolMessageItem;

