import { FC, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { Message } from '../../store/modules/chatStore';
import { pickToolKind } from './tool-message-metadata';
import ToolStatusGlyph from './ToolStatusGlyph';
import './chat.css';

function coerceString(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
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

  const glyphAria = useMemo(() => {
    const parts = [title];
    if (statusLabel) parts.push(statusLabel);
    return parts.join(' · ');
  }, [statusLabel, title]);

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
          <ToolStatusGlyph
            kind={kind}
            statusKey={statusKey}
            riskLevel={riskLevel}
            ariaLabel={glyphAria}
          />
          <span className="cf-toolMsg__title">{title}</span>
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
