import { FC, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CheckCircleFilled,
  CloudOutlined,
  CodeOutlined,
  ExclamationCircleFilled,
  ExperimentOutlined,
  LoadingOutlined,
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
  return coerceString(meta?.toolKind) ?? coerceString(meta?.tool_kind);
}

function pickRiskLevel(meta: Record<string, unknown> | undefined): 'low' | 'medium' | 'high' | null {
  const r = coerceString(meta?.riskLevel) ?? coerceString(meta?.risk_level) ?? coerceString(meta?.risk);
  if (r === 'low' || r === 'medium' || r === 'high') return r;
  return null;
}

function isSubAgentKind(kind: string | null): boolean {
  if (!kind) return false;
  return kind === 'tool.subagent.run' || kind.startsWith('tool.subagent.');
}

function summarize(content: string, maxLen: number): string {
  const oneLine = String(content ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!oneLine) return '';
  if (oneLine.length <= maxLen) return oneLine;
  return `${oneLine.slice(0, maxLen - 1)}…`;
}

function pickStatusKey(meta: Record<string, unknown> | undefined): string | null {
  const ui = coerceString(meta?.uiStatus);
  const st = coerceString(meta?.status);
  const raw = ui ?? st;
  if (!raw) return null;
  if (raw === 'result' || raw === 'success') return 'result';
  if (raw === 'running') return 'running';
  if (raw === 'error') return 'error';
  return raw;
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
    return t('chat.toolMessage.title');
  }, [kind, message.toolCallId, meta, t]);

  const statusKey = useMemo(() => pickStatusKey(meta), [meta]);
  const statusLabel = useMemo(() => {
    if (!statusKey) return null;
    if (statusKey === 'result') return t('chat.toolMessage.status.result');
    if (statusKey === 'running') return t('chat.toolMessage.status.running');
    if (statusKey === 'error') return t('chat.toolMessage.status.error');
    return statusKey;
  }, [statusKey, t]);

  const argsPreview = coerceString(meta?.argumentsPreview);
  const toolName = coerceString(meta?.toolName);
  const isReadFileTool =
    toolName === 'workspace_read_file' || toolName === 'workspace_read_file_preview';

  const summary = useMemo(() => {
    if (isReadFileTool) return '';
    return summarize(message.content, 160);
  }, [message.content, isReadFileTool]);

  const readFileCollapsedHint = useMemo(() => {
    if (!isReadFileTool) return null;
    if (statusKey === 'running') return t('chat.toolMessage.readFileRunning');
    if (statusKey === 'error') return t('chat.toolMessage.readFileErrorCollapsed');
    if (statusKey === 'result') return t('chat.toolMessage.readFileDoneCollapsed');
    return null;
  }, [isReadFileTool, statusKey, t]);

  const loadingIcon = useMemo(() => {
    if (statusKey !== 'running') return null;
    const tn = coerceString(meta?.toolName);
    if (tn === 'delegate_to_subagent' || isSubAgentKind(kind)) {
      return <LoadingOutlined className="cf-toolMsg__loading" spin />;
    }
    if (tn === 'workspace_read_file' || tn === 'workspace_read_file_preview') {
      return <LoadingOutlined className="cf-toolMsg__loading" spin />;
    }
    return null;
  }, [kind, meta, statusKey]);

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
          {loadingIcon}
          <span className="cf-toolMsg__title">{title}</span>
          {statusLabel ? (
            <span
              className={`cf-toolMsg__badge cf-toolMsg__badge--${statusKey ?? 'unknown'}`}
              data-status={statusKey ?? ''}
            >
              {statusLabel}
            </span>
          ) : null}
          {readFileCollapsedHint ? (
            <span className="cf-toolMsg__oneLine cf-toolMsg__oneLine--hint">{readFileCollapsedHint}</span>
          ) : summary ? (
            <span className="cf-toolMsg__oneLine">{summary}</span>
          ) : null}
        </summary>
        <div className="cf-toolMsg__body">
          {message.toolCallId ? (
            <div className="cf-toolMsg__kv">
              <span className="cf-toolMsg__k">{t('chat.toolMessage.callId')}</span>
              <span className="cf-toolMsg__v">{message.toolCallId}</span>
            </div>
          ) : null}
          {argsPreview ? (
            <div className="cf-toolMsg__section">
              <div className="cf-toolMsg__sectionTitle">{t('chat.toolMessage.argsTitle')}</div>
              <pre className="cf-toolMsg__pre cf-toolMsg__pre--compact">{argsPreview}</pre>
            </div>
          ) : null}
          <div className="cf-toolMsg__section">
            <div className="cf-toolMsg__sectionTitle">{t('chat.toolMessage.outputTitle')}</div>
            {isReadFileTool && statusKey === 'running' ? (
              <div className="cf-toolMsg__outputPlaceholder">{t('chat.toolMessage.readFileRunning')}</div>
            ) : (
              <pre className="cf-toolMsg__pre">{String(message.content ?? '')}</pre>
            )}
          </div>
          {metaJson ? (
            <details className="cf-toolMsg__metaFold">
              <summary>{t('chat.toolMessage.debugMeta')}</summary>
              <pre className="cf-toolMsg__pre cf-toolMsg__pre--meta">{metaJson}</pre>
            </details>
          ) : null}
        </div>
      </details>
    </div>
  );
};

export default ToolMessageItem;
