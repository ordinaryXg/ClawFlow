import { FC, useState } from 'react';
import { useTranslation } from 'react-i18next';
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
  const [saving, setSaving] = useState(false);

  if (!visible) return null;

  const submit = async () => {
    const trimmed = token.trim();
    if (!trimmed) {
      (window as any).__cf_toast?.error?.(t('settings.modelTokenRequiredTitle'), t('settings.modelTokenRequiredBody'));
      return;
    }
    setSaving(true);
    try {
      await window.electronAPI?.setModelAuthToken?.({
        provider,
        token: trimmed,
        profileId: `${provider}:manual`,
      });
      setToken('');
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
        <select
          className="cf-select cf-select--compact"
          value={provider}
          disabled={saving}
          aria-label={t('settings.modelProvider')}
          onChange={(e) => setProvider(e.target.value as ProviderId)}
        >
          <option value="deepseek">DeepSeek</option>
          <option value="openai">OpenAI</option>
          <option value="anthropic">Anthropic</option>
        </select>
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
