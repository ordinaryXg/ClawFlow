import { FC, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import './chat.css';

interface Props {
  disabled?: boolean;
  onSend: (content: string) => Promise<void> | void;
  models?: Array<{ id: string; label: string }>;
  modelId?: string | null;
  onModelChange?: (modelId: string | null) => void;
}

const ChatInput: FC<Props> = ({ disabled, onSend, models, modelId, onModelChange }) => {
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

