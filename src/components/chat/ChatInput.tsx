import { FC, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ChatInteractionMode } from '../../store/modules/chatStore';
import { useShellLayoutVariant } from '../../context/ShellLayoutContext';
import { CfSelectWithHints } from '../CfSelectWithHints';
import ContextUsageRing from './ContextUsageRing';
import './chat.css';

const CHAT_MODES: ChatInteractionMode[] = ['plan', 'multitask', 'auto'];

/** 对话模式：重叠对话气泡，象征多模式对话 */
function IconChatMode() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M7 6H5a2 2 0 00-2 2v5a2 2 0 002 2h1.2L8 17v-2.2A2 2 0 009 13V8a2 2 0 00-2-2z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      <path
        d="M20 10h-5a2 2 0 00-2 2v2a2 2 0 002 2h2.2L20 18v-2.5a1.5 1.5 0 001.5-1.5V12a2 2 0 00-2-2z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** 偏好/强度：递升柱形，象征更快 / 更强 / 更省钱的梯度 */
function IconIntent() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="5" y="14" width="3.5" height="6" rx="0.75" fill="currentColor" />
      <rect x="10.25" y="10" width="3.5" height="10" rx="0.75" fill="currentColor" />
      <rect x="15.5" y="6" width="3.5" height="14" rx="0.75" fill="currentColor" />
    </svg>
  );
}

/** 模型：同心圆靶心，与原先 ⊚ 语义一致 */
function IconModel() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="7" stroke="currentColor" strokeWidth="2" />
      <circle cx="12" cy="12" r="3.5" stroke="currentColor" strokeWidth="2" />
      <circle cx="12" cy="12" r="1.2" fill="currentColor" />
    </svg>
  );
}

const STARTER_IDS = [1, 2, 3, 4, 5] as const;

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
  /** 0–1，当前会话相对模型上下文上限的粗略饱和度 */
  contextSaturation?: number;
  contextUsedApprox?: number;
  contextLimitApprox?: number;
  showStarterPrompts?: boolean;
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
  showStarterPrompts,
  contextSaturation = 0,
  contextUsedApprox,
  contextLimitApprox,
}) => {
  const { t } = useTranslation();
  const shellVariant = useShellLayoutVariant();
  const stickyCompactRow = shellVariant === 'alternate';
  const [value, setValue] = useState('');
  const [isSending, setIsSending] = useState(false);

  const canSend = useMemo(() => {
    return !disabled && !isSending && value.trim().length > 0;
  }, [disabled, isSending, value]);

  const modeOptions = useMemo(
    () =>
      CHAT_MODES.map((m) => ({
        value: m,
        label:
          m === 'plan'
            ? t('chat.modePlan')
            : m === 'multitask'
              ? t('chat.modeMultitask')
              : t('chat.modeAuto'),
        hint:
          m === 'plan'
            ? t('chat.modeCapabilityPlan')
            : m === 'multitask'
              ? t('chat.modeCapabilityMultitask')
              : t('chat.modeCapabilityAuto'),
      })),
    [t],
  );

  const intentOptions = useMemo(
    () => [
      { value: 'fast', label: t('chat.intentFast'), hint: t('chat.intentHintFast') },
      { value: 'strong', label: t('chat.intentStrong'), hint: t('chat.intentHintStrong') },
      { value: 'cheap', label: t('chat.intentCheap'), hint: t('chat.intentHintCheap') },
    ],
    [t],
  );

  const modelOptions = useMemo(() => {
    const opts = [{ value: '', label: t('chat.modelAuto'), hint: t('chat.modelAutoHint') }];
    for (const m of models ?? []) {
      opts.push({
        value: m.id,
        label: m.label,
        hint: t('chat.modelIdHint', { label: m.label }),
      });
    }
    return opts;
  }, [models, t]);

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
    <div className={`cf-chatInput${stickyCompactRow ? ' cf-chatInput--stickyFoot' : ''}`}>
      {showStarterPrompts ? (
        <div className="cf-chatInput__starters" role="group" aria-label={t('chat.starterChipsAria')}>
          {STARTER_IDS.map((id) => (
            <button
              key={id}
              type="button"
              className="cf-chatInput__starterChip"
              onClick={() => setValue(t(`chat.starterPrompt${id}`))}
            >
              {t(`chat.starterChip${id}`)}
            </button>
          ))}
        </div>
      ) : null}
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
          <div className="cf-chatInput__fieldGroup" title={t('chat.modeLabel')}>
            <span className="cf-chatInput__fieldIco" aria-hidden>
              <IconChatMode />
            </span>
            <CfSelectWithHints
              id="cf-chat-mode"
              className="cf-selectHint--compact"
              popupClassName={stickyCompactRow ? 'cf-selectHintDropdown--sticky' : ''}
              value={interactionMode}
              onChange={(v) => onInteractionModeChange(v as ChatInteractionMode)}
              options={modeOptions}
              disabled={disabled || isSending}
              aria-label={t('chat.modeLabel')}
              hintIconAriaBase={t('chat.modeHelpAria')}
              popupMatchSelectWidth={false}
            />
          </div>
          <div className="cf-chatInput__fieldGroup" title={t('chat.intentLabel')}>
            <span className="cf-chatInput__fieldIco" aria-hidden>
              <IconIntent />
            </span>
            <CfSelectWithHints
              id="cf-chat-intent"
              className="cf-selectHint--compact"
              popupClassName={stickyCompactRow ? 'cf-selectHintDropdown--sticky' : ''}
              value={intent}
              onChange={(v) => onIntentChange(v as 'fast' | 'strong' | 'cheap')}
              options={intentOptions}
              disabled={disabled || isSending}
              aria-label={t('chat.intentLabel')}
              hintIconAriaBase={t('common.selectOptionHintAria')}
              popupMatchSelectWidth={false}
            />
          </div>
          <div className="cf-chatInput__fieldGroup cf-chatInput__fieldGroup--modelMeter" title={t('chat.model')}>
            <span className="cf-chatInput__fieldIco" aria-hidden>
              <IconModel />
            </span>
            <CfSelectWithHints
              className={stickyCompactRow ? 'cf-selectHint--compact cf-selectHint--chatModel' : 'cf-selectHint--chatModel'}
              popupClassName={stickyCompactRow ? 'cf-selectHintDropdown--sticky' : ''}
              value={modelId ?? ''}
              onChange={(v) => onModelChange?.(v ? v : null)}
              options={modelOptions}
              disabled={disabled || isSending || !models || models.length === 0}
              aria-label={t('chat.model')}
              hintIconAriaBase={t('common.selectOptionHintAria')}
              popupMatchSelectWidth={false}
            />
            <ContextUsageRing
              ratio={contextSaturation}
              usedTokensApprox={contextUsedApprox}
              limitTokensApprox={contextLimitApprox}
            />
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
