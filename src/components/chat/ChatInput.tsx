import { FC, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dropdown } from 'antd';
import type { MenuProps } from 'antd';
import './chat.css';

interface Props {
  disabled?: boolean;
  onSend: (content: string) => Promise<void> | void;
  models?: Array<{ id: string; label: string }>;
  modelId?: string | null;
  onModelChange?: (modelId: string | null) => void;
  workspaceLabel?: string;
  workspaceRecent?: string[];
  workspaceLocked?: boolean;
  onWorkspacePick?: () => void | Promise<void>;
  onWorkspaceSelect?: (workspacePath: string) => void | Promise<void>;
}

function folderBasename(p: string): string {
  const s = String(p ?? '').replace(/[/\\]+$/, '');
  const i = Math.max(s.lastIndexOf('/'), s.lastIndexOf('\\'));
  return i >= 0 ? s.slice(i + 1) : s;
}

const ChatInput: FC<Props> = ({
  disabled,
  onSend,
  models,
  modelId,
  onModelChange,
  workspaceLabel,
  workspaceRecent,
  workspaceLocked,
  onWorkspacePick,
  onWorkspaceSelect,
}) => {
  const { t } = useTranslation();
  const [value, setValue] = useState('');
  const [isSending, setIsSending] = useState(false);

  const canSend = useMemo(() => {
    return !disabled && !isSending && value.trim().length > 0;
  }, [disabled, isSending, value]);

  const wsDisabled = Boolean(disabled || isSending || workspaceLocked);

  const menuWorkspace: MenuProps = useMemo(() => {
    const recent = Array.isArray(workspaceRecent) ? workspaceRecent : [];
    const items: NonNullable<MenuProps['items']> = [
      ...recent.map((p) => ({
        key: p,
        label: folderBasename(p),
        title: p,
        onClick: () => void onWorkspaceSelect?.(p),
        disabled: wsDisabled,
      })),
      ...(recent.length ? [{ type: 'divider' as const }] : []),
      {
        key: 'pick',
        label: t('workspace.openFolder'),
        onClick: () => void onWorkspacePick?.(),
        disabled: wsDisabled,
      },
    ];
    return { items };
  }, [onWorkspacePick, onWorkspaceSelect, t, workspaceRecent, wsDisabled]);

  useEffect(() => {
    if (disabled) setIsSending(false);
  }, [disabled]);

  const submit = async () => {
    if (!canSend) return;
    const content = value.trim();
    setValue('');
    setIsSending(true);
    try {
      await onSend(content);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="cf-chatInput">
      <textarea
        className="cf-textarea"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={t('chat.inputPlaceholder')}
        disabled={disabled || isSending}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            void submit();
          }
        }}
        rows={3}
      />
      <div className="cf-chatInput__footer">
        <div className="cf-chatInput__model">
          <span className="cf-sub">{t('chat.model')}</span>
          <select
            className="cf-select cf-select--compact"
            value={modelId ?? ''}
            disabled={disabled || isSending || !models || models.length === 0}
            onChange={(e) => onModelChange?.(e.target.value ? e.target.value : null)}
            aria-label={t('chat.model')}
          >
            <option value="">{t('chat.modelAuto')}</option>
            {(models ?? []).map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>

          <span className="cf-sub cf-chatInput__wsLabel">{t('workspace.title')}</span>
          <Dropdown menu={menuWorkspace} trigger={['click']} disabled={wsDisabled}>
            <button
              className={wsDisabled ? 'cf-btn cf-btnSmall cf-chatInput__wsBtn cf-chatInput__wsBtn--disabled' : 'cf-btn cf-btnSmall cf-chatInput__wsBtn'}
              type="button"
              title={workspaceLocked ? t('chat.workspaceLockedHint') : workspaceLabel || ''}
              disabled={wsDisabled}
            >
              <span className="cf-chatInput__wsName">{workspaceLabel || t('workspace.default')}</span>
              <span className="cf-chatInput__wsChev" aria-hidden>
                ▾
              </span>
            </button>
          </Dropdown>
        </div>
        <div className="cf-chatInput__actions">
          <button
            className={canSend ? 'cf-btn cf-btnPrimary' : 'cf-btn'}
            onClick={() => void submit()}
            disabled={!canSend}
          >
            {isSending ? t('chat.sending') : t('chat.send')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChatInput;

