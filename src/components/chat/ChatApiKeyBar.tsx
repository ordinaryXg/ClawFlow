import { FC, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CfSelectWithHints } from '../CfSelectWithHints';
import './chat.css';

type ProviderId = 'deepseek' | 'openai' | 'anthropic';

interface Props {
  visible: boolean;
  onSaved: () => void | Promise<void>;
  onOpenFullSettings: () => void;
}

/** 当内置模型目录均无可用密钥时，在对话页提供就地填写入口 */
const ChatApiKeyBar: FC<Props> = ({ visible, onSaved, onOpenFullSettings }) => {
  const { t } = useTranslation();
  const [provider, setProvider] = useState<ProviderId>('deepseek');
  const [token, setToken] = useState('');
  const [label, setLabel] = useState('');
  const [saving, setSaving] = useState(false);

  const providerOptions = useMemo(
    () => [
      { value: 'deepseek', label: 'DeepSeek', hint: t('settings.providerHintDeepseek') },
      { value: 'openai', label: 'OpenAI', hint: t('settings.providerHintOpenai') },
      { value: 'anthropic', label: 'Anthropic', hint: t('settings.providerHintAnthropic') },
    ],
    [t],
  );

  if (!visible) return null;

  const submit = async () => {
    const trimmed = token.trim();
    if (!trimmed) {
      (window as any).__cf_toast?.error?.(t('settings.modelTokenRequiredTitle'), t('settings.modelTokenRequiredBody'));
      return;
    }
    setSaving(true);
    try {
      await window.electronAPI?.engineAuthUpsertProfile?.({
        provider,
        token: trimmed,
        ...(label.trim() ? { label: label.trim() } : {}),
      });
      setToken('');
      setLabel('');
      await onSaved();
      (window as any).__cf_toast?.success?.(t('settings.modelSavedTitle'), t('chat.apiKeySavedBody'));
    } catch (e: any) {
      (window as any).__cf_toast?.error?.(t('settings.modelSaveFailTitle'), e?.message || t('common.sampleOpFailBody'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="cf-chatApiKeyBar" role="region" aria-label={t('chat.apiKeyBarTitle')}>
      <div className="cf-chatApiKeyBar__title">{t('chat.apiKeyBarTitle')}</div>
      <p className="cf-chatApiKeyBar__hint">{t('chat.apiKeyBarBody')}</p>
      <div className="cf-chatApiKeyBar__row">
        <CfSelectWithHints
          className="cf-selectHint--compact"
          value={provider}
          onChange={(v) => setProvider(v as ProviderId)}
          options={providerOptions}
          disabled={saving}
          aria-label={t('settings.modelProvider')}
          hintIconAriaBase={t('common.selectOptionHintAria')}
          popupMatchSelectWidth={false}
        />
        <input
          className="cf-input"
          value={label}
          disabled={saving}
          placeholder={t('settings.modelProfileNamePh')}
          onChange={(e) => setLabel(e.target.value)}
        />
        <input
          className="cf-input cf-chatApiKeyBar__token"
          type="password"
          autoComplete="off"
          value={token}
          disabled={saving}
          placeholder={t('settings.modelTokenPh')}
          onChange={(e) => setToken(e.target.value)}
        />
        <button type="button" className="cf-btn cf-btnPrimary cf-btnSmall" disabled={saving} onClick={() => void submit()}>
          {saving ? t('settings.modelSaving') : t('chat.apiKeySave')}
        </button>
      </div>
      <div className="cf-chatApiKeyBar__footer">
        <button type="button" className="cf-btn cf-btnGhost cf-btnSmall" disabled={saving} onClick={onOpenFullSettings}>
          {t('chat.apiKeyOpenSettings')}
        </button>
      </div>
    </div>
  );
};

export default ChatApiKeyBar;
