import { FC, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CheckCircleFilled,
  CloudOutlined,
  CodeOutlined,
  DownOutlined,
  ExperimentOutlined,
  ExclamationCircleFilled,
  LoadingOutlined,
  RightOutlined,
  ToolOutlined,
} from '@ant-design/icons';
import type { Message } from '../../store/modules/chatStore';
import { pickToolKind } from './tool-message-metadata';
import ToolMessageItem from './ToolMessageItem';
import './chat.css';

function coerceString(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
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

const ToolMessageGroup: FC<{ messages: Message[] }> = ({ messages }) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  const first = messages[0];
  const meta0 = first?.meta;

  const kind = useMemo(() => pickToolKind(meta0), [meta0]);
  const title = useMemo(() => {
    const mt = coerceString(meta0?.title);
    if (mt) return mt;
    if (kind) return kind;
    if (first?.toolCallId) return `tool_call:${first.toolCallId}`;
    return t('chat.toolMessage.title');
  }, [kind, first?.toolCallId, meta0, t]);

  const aggregateStatus = useMemo(() => {
    let anyRun = false;
    let anyErr = false;
    let anyOk = false;
    for (const m of messages) {
      const sk = pickStatusKey(m.meta);
      if (sk === 'running') anyRun = true;
      else if (sk === 'error') anyErr = true;
      else if (sk === 'result') anyOk = true;
    }
    if (anyRun) return 'running' as const;
    if (anyErr) return 'error' as const;
    if (anyOk) return 'result' as const;
    return 'unknown' as const;
  }, [messages]);

  const statusLabel = useMemo(() => {
    if (aggregateStatus === 'running') return t('chat.toolMessage.status.running');
    if (aggregateStatus === 'error') return t('chat.toolMessage.groupPartialError');
    if (aggregateStatus === 'result') return t('chat.toolMessage.groupAllDone');
    return null;
  }, [aggregateStatus, t]);

  const icon = useMemo(() => {
    if (!kind) return <ToolOutlined className="cf-toolMsg__icon" aria-hidden />;
    if (kind.startsWith('tool.network')) return <CloudOutlined className="cf-toolMsg__icon" aria-hidden />;
    if (kind.startsWith('tool.exec')) return <CodeOutlined className="cf-toolMsg__icon" aria-hidden />;
    if (kind.startsWith('tool.subagent')) return <ExperimentOutlined className="cf-toolMsg__icon" aria-hidden />;
    return <ToolOutlined className="cf-toolMsg__icon" aria-hidden />;
  }, [kind]);

  const statusIcon =
    aggregateStatus === 'running' ? (
      <LoadingOutlined className="cf-toolMsg__loading" spin />
    ) : aggregateStatus === 'error' ? (
      <ExclamationCircleFilled className="cf-toolMsg__risk cf-toolMsg__risk--high" aria-hidden />
    ) : aggregateStatus === 'result' ? (
      <CheckCircleFilled className="cf-toolMsg__risk cf-toolMsg__risk--low" aria-hidden />
    ) : null;

  const count = messages.length;

  return (
    <div className="cf-toolMsg cf-toolMsgGroup">
      <button
        type="button"
        className="cf-toolMsgGroup__summary"
        aria-expanded={open}
        aria-label={open ? t('chat.toolMessage.groupCollapse') : t('chat.toolMessage.groupExpand')}
        onClick={() => setOpen((v) => !v)}
      >
        {icon}
        {statusIcon}
        <span className="cf-toolMsg__title">
          {title}
          <span className="cf-toolMsgGroup__count">{t('chat.toolMessage.groupCount', { count })}</span>
        </span>
        {statusLabel ? (
          <span className={`cf-toolMsg__badge cf-toolMsg__badge--${aggregateStatus}`} data-status={aggregateStatus}>
            {statusLabel}
          </span>
        ) : null}
        <span className="cf-toolMsgGroup__chev" aria-hidden>
          {open ? <DownOutlined /> : <RightOutlined />}
        </span>
      </button>
      {open ? (
        <div className="cf-toolMsgGroup__body">
          {messages.map((m) => (
            <div key={m.id} className="cf-toolMsgGroup__item">
              <ToolMessageItem message={m} />
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
};

export default ToolMessageGroup;
