import { FC, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DownOutlined, RightOutlined } from '@ant-design/icons';
import type { Message } from '../../store/modules/chatStore';
import { pickToolKind } from './tool-message-metadata';
import ToolMessageItem from './ToolMessageItem';
import ToolStatusGlyph from './ToolStatusGlyph';
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

  const glyphAria = useMemo(() => {
    const parts = [title, t('chat.toolMessage.groupCount', { count: messages.length })];
    if (statusLabel) parts.push(statusLabel);
    return parts.join(' · ');
  }, [messages.length, statusLabel, t, title]);

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
        <ToolStatusGlyph kind={kind} statusKey={aggregateStatus} ariaLabel={glyphAria} />
        <span className="cf-toolMsg__title">
          {title}
          <span className="cf-toolMsgGroup__count">{t('chat.toolMessage.groupCount', { count })}</span>
        </span>
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
