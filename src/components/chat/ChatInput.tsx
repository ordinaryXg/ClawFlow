import { FC, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ChatInteractionMode } from '../../store/modules/chatStore';
import './chat.css';

interface Props {
  disabled?: boolean;
  onSend: (content: string) => Promise<void> | void;
  models?: Array<{ id: string; label: string }>;
  modelId?: string | null;
  onModelChange?: (modelId: string | null) => void;
  interactionMode: ChatInteractionMode;
  onInteractionModeChange: (mode: ChatInteractionMode) => void;
  intent: 'fast' | 'strong' | 'cheap';
  onIntentChange: (intent: 'fast' | 'strong' | 'cheap') => void;
}

const ChatInput: FC<Props> = ({
  disabled,
  onSend,
  models,
  modelId,
  onModelChange,
  interactionMode,
  onInteractionModeChange,
  intent,
  onIntentChange,
}) => {
  const { t } = useTranslation();
  const [value, setValue] = useState('');
  const [isSending, setIsSending] = useState(false);

  const canSend = useMemo(() => {
    return !disabled && !isSending && value.trim().length > 0;
  }, [disabled, isSending, value]);

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
        <div className="cf-chatInput__footerLeft">
          <div className="cf-chatInput__modes">
            <label className="cf-sub" htmlFor="cf-chat-mode">
              {t('chat.modeLabel')}
            </label>
            <select
              id="cf-chat-mode"
              className="cf-select cf-select--compact"
              value={interactionMode}
              disabled={disabled || isSending}
              onChange={(e) => onInteractionModeChange(e.target.value as ChatInteractionMode)}
              aria-label={t('chat.modeLabel')}
            >
              <option value="ask">{t('chat.modeAsk')}</option>
              <option value="plan">{t('chat.modePlan')}</option>
              <option value="multitask">{t('chat.modeMultitask')}</option>
              <option value="auto">{t('chat.modeAuto')}</option>
            </select>
          </div>
          <div className="cf-chatInput__modes">
            <label className="cf-sub" htmlFor="cf-chat-intent">
              {t('chat.intentLabel')}
            </label>
            <select
              id="cf-chat-intent"
              className="cf-select cf-select--compact"
              value={intent}
              disabled={disabled || isSending}
              onChange={(e) => onIntentChange(e.target.value as any)}
              aria-label={t('chat.intentLabel')}
            >
              <option value="fast">{t('chat.intentFast')}</option>
              <option value="strong">{t('chat.intentStrong')}</option>
              <option value="cheap">{t('chat.intentCheap')}</option>
            </select>
          </div>
          <div className="cf-chatInput__model">
            <span className="cf-ico" title={t('chat.model')} aria-label={t('chat.model')}>
              ⊚
            </span>
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
          </div>
        </div>
        <div className="cf-chatInput__actions">
          <button
            className={canSend ? 'cf-btn cf-btnPrimary cf-chatSendBtn' : 'cf-btn cf-chatSendBtn'}
            onClick={() => void submit()}
            disabled={!canSend}
            aria-label={t('chat.send')}
            title={t('chat.send')}
          >
            <span className="cf-ico" aria-hidden="true">
              {isSending ? '…' : '➤'}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChatInput;

