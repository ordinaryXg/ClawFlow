import { FC, useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import i18n from '../../i18n';
import './styles.css';
import { useGatewayStore } from '../../store/modules/gatewayStore';
import { useSettingsStore } from '../../store/modules/settingsStore';

const SettingsPage: FC = () => {
  const { t } = useTranslation();
  const { version, fetchVersion, error: gatewayError, fetchStatus } = useGatewayStore();
  const {
    theme,
    language,
    autoStartGateway,
    logLevel,
    openclawCliPath: storeCliPath,
    commandTimeout: storeTimeout,
    updateSettings,
    resetSettings,
  } = useSettingsStore();

  const [cliPath, setCliPath] = useState(storeCliPath);
  const [timeoutMs, setTimeoutMs] = useState(storeTimeout);
  const [pathCheck, setPathCheck] = useState<'idle' | 'ok' | 'fail'>('idle');
  const [appVersion, setAppVersion] = useState<string>('');
  const [modelProvider, setModelProvider] = useState<'deepseek' | 'openai'>('deepseek');
  const [modelToken, setModelToken] = useState('');
  const [defaultModelId, setDefaultModelId] = useState('deepseek/deepseek-chat');
  const [modelSaving, setModelSaving] = useState(false);
  const [configuredModels, setConfiguredModels] = useState<Array<{ id: string; available?: boolean; tags?: string[] }>>([]);
  const [configuredProviders, setConfiguredProviders] = useState<string[]>([]);

  useEffect(() => {
    setCliPath(storeCliPath);
    setTimeoutMs(storeTimeout);
  }, [storeCliPath, storeTimeout]);

  useEffect(() => {
    void fetchVersion();
    void fetchStatus();
    void (async () => {
      try {
        const v = await window.electronAPI?.getAppVersion?.();
        if (v) setAppVersion(v);
      } catch {
        setAppVersion('');
      }
    })();
  }, [fetchStatus, fetchVersion]);

  useEffect(() => {
    void (async () => {
      try {
        const res = await window.electronAPI?.getModels?.();
        const def = typeof res?.defaultModelId === 'string' ? res.defaultModelId : '';
        if (def) setDefaultModelId(def);
        const list = Array.isArray(res?.models) ? res.models : [];
        setConfiguredModels(
          list
            .map((m: any) => {
              const id = String(m?.id ?? '').trim();
              if (!id) return null;
              return { id, available: m?.available, tags: Array.isArray(m?.tags) ? m.tags : undefined };
            })
            .filter(Boolean) as Array<{ id: string; available?: boolean; tags?: string[] }>
        );
        setConfiguredProviders(Array.isArray(res?.configuredProviders) ? res.configuredProviders : []);
      } catch {
        setConfiguredModels([]);
        setConfiguredProviders([]);
      }
    })();
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const cfg = await window.electronAPI?.getConfig?.();
        if (cfg && typeof cfg === 'object' && 'cliPath' in cfg) {
          const p = String((cfg as { cliPath?: string }).cliPath ?? '');
          setCliPath((prev) => (prev.trim() ? prev : p));
        }
      } catch {
        /* ignore */
      }
    })();
  }, []);

  const pathHint = useMemo(() => {
    if (pathCheck === 'ok') return t('settings.pathCheckOk');
    if (pathCheck === 'fail') return t('settings.pathCheckFail');
    return null;
  }, [pathCheck, t]);

  const persistEngine = useCallback(async () => {
    const path = cliPath.trim();
    const payload: { cliPath?: string; commandTimeout: number } = { commandTimeout: timeoutMs };
    if (path) payload.cliPath = path;
    await window.electronAPI.updateConfig(payload);
    useGatewayStore.getState().updateConfig({ cliPath: path || undefined, commandTimeout: timeoutMs });
  }, [cliPath, timeoutMs]);

  const onSave = async () => {
    updateSettings({
      openclawCliPath: cliPath,
      commandTimeout: timeoutMs,
      theme,
      language,
      autoStartGateway,
      logLevel,
    });
    try {
      await persistEngine();
      (window as any).__cf_toast?.success?.(t('settings.savedTitle'), t('settings.savedBody'));
    } catch {
      (window as any).__cf_toast?.error?.(t('settings.savePartialTitle'), t('settings.savePartialBody'));
    }
  };

  const onPick = async () => {
    try {
      const picked = await window.electronAPI?.pickCliPath?.();
      if (picked) {
        setCliPath(picked);
        setPathCheck('idle');
      } else {
        (window as any).__cf_toast?.success?.(t('common.sampleTitle'), t('settings.pickCancelled'));
      }
    } catch {
      (window as any).__cf_toast?.error?.(t('common.sampleDetectFailTitle'), t('common.sampleDetectFailBody'));
    }
  };

  const onDetect = async () => {
    try {
      await persistEngine();
      const ok = await window.electronAPI?.validateCLI?.();
      setPathCheck(ok ? 'ok' : 'fail');
      if (ok) {
        void fetchVersion();
        (window as any).__cf_toast?.success?.(t('settings.pathCheckOk'), '');
      } else {
        (window as any).__cf_toast?.error?.(t('settings.pathCheckFail'), t('settings.pathInvalid'));
      }
    } catch {
      setPathCheck('fail');
      (window as any).__cf_toast?.error?.(t('common.sampleDetectFailTitle'), t('common.sampleDetectFailBody'));
    }
  };

  const onReset = () => {
    if (!window.confirm(t('settings.resetConfirm'))) return;
    resetSettings();
    const st = useSettingsStore.getState();
    setCliPath(st.openclawCliPath);
    setTimeoutMs(st.commandTimeout);
    setPathCheck('idle');
    void i18n.changeLanguage(st.language);
    document.documentElement.dataset.theme = st.theme;
    (window as any).__cf_toast?.success?.(t('settings.resetOkTitle'), t('settings.resetOkBody'));
  };

  const onSaveModel = async () => {
    const provider = modelProvider;
    const token = modelToken.trim();
    const modelId = defaultModelId.trim();
    if (!token) {
      (window as any).__cf_toast?.error?.(t('settings.modelTokenRequiredTitle'), t('settings.modelTokenRequiredBody'));
      return;
    }

    setModelSaving(true);
    try {
      await window.electronAPI?.setModelAuthToken?.({ provider, token, profileId: `${provider}:manual` });
      if (modelId) {
        await window.electronAPI?.setDefaultModel?.({ modelId });
      }
      setModelToken('');
      try {
        const res = await window.electronAPI?.getModels?.();
        const list = Array.isArray(res?.models) ? res.models : [];
        setConfiguredModels(
          list
            .map((m: any) => {
              const id = String(m?.id ?? '').trim();
              if (!id) return null;
              return { id, available: m?.available, tags: Array.isArray(m?.tags) ? m.tags : undefined };
            })
            .filter(Boolean) as Array<{ id: string; available?: boolean; tags?: string[] }>
        );
        setConfiguredProviders(Array.isArray(res?.configuredProviders) ? res.configuredProviders : []);
      } catch {
        // ignore
      }
      (window as any).__cf_toast?.success?.(t('settings.modelSavedTitle'), t('settings.modelSavedBody'));
    } catch (e: any) {
      (window as any).__cf_toast?.error?.(t('settings.modelSaveFailTitle'), e?.message || t('common.sampleOpFailBody'));
    } finally {
      setModelSaving(false);
    }
  };

  return (
    <>
      <div className="cf-topbar">
        <div className="cf-pageTitle">
          <h2>{t('settings.title')}</h2>
          <p>{t('settings.subtitle')}</p>
        </div>
        <div className="cf-row cf-settingsPage__actions">
          <button className="cf-btn cf-btnGhost" type="button" onClick={onReset}>
            {t('settings.reset')}
          </button>
          <button className="cf-btn cf-btnPrimary" type="button" onClick={() => void onSave()}>
            {t('settings.save')}
          </button>
        </div>
      </div>

      {gatewayError ? (
        <div className="cf-banner" style={{ borderColor: 'rgba(194,75,75,.45)', background: 'rgba(194,75,75,.10)' }}>
          <div>
            <b>{t('settings.detectFailedTitle')}</b>
            <span>{gatewayError}</span>
          </div>
          <button type="button" className="cf-btn cf-btnDanger" onClick={() => void fetchVersion()}>
            {t('settings.retry')}
          </button>
        </div>
      ) : null}

      <section className="cf-grid cf-settingsPage__grid">
        <div className="cf-card cf-col6">
          <h3>{t('settings.appearance')}</h3>
          <div className="cf-divider" />

          <div className="cf-row cf-settingsPage__row">
            <div>
              <div className="cf-sub">
                <strong style={{ color: 'var(--text)' }}>{t('settings.theme')}</strong>
              </div>
              <div className="cf-help">{t('settings.themeHelp')}</div>
            </div>
            <div className="cf-row">
              <button
                type="button"
                className={theme === 'dark' ? 'cf-btn cf-btnGold cf-btnSmall' : 'cf-btn cf-btnSmall'}
                onClick={() => updateSettings({ theme: 'dark' })}
              >
                {t('common.dark')}
              </button>
              <button
                type="button"
                className={theme === 'light' ? 'cf-btn cf-btnGold cf-btnSmall' : 'cf-btn cf-btnSmall'}
                onClick={() => updateSettings({ theme: 'light' })}
              >
                {t('common.light')}
              </button>
            </div>
          </div>

          <div style={{ height: 10 }} />

          <div className="cf-row cf-settingsPage__row">
            <div>
              <div className="cf-sub">
                <strong style={{ color: 'var(--text)' }}>{t('settings.language')}</strong>
              </div>
              <div className="cf-help">{t('settings.languageHelp')}</div>
            </div>
            <div className="cf-row">
              <button
                type="button"
                className={language === 'zh' ? 'cf-btn cf-btnGold cf-btnSmall' : 'cf-btn cf-btnSmall'}
                onClick={() => updateSettings({ language: 'zh' })}
              >
                {t('common.chinese')}
              </button>
              <button
                type="button"
                className={language === 'en' ? 'cf-btn cf-btnGold cf-btnSmall' : 'cf-btn cf-btnSmall'}
                onClick={() => updateSettings({ language: 'en' })}
              >
                {t('common.english')}
              </button>
            </div>
          </div>
        </div>

        <div className="cf-card cf-col6">
          <h3>{t('settings.openclaw')}</h3>
          <div className="cf-divider" />

          <div className="cf-sub">
            {t('settings.versionLabel')}：{version || t('settings.notDetected')}
          </div>
          <div style={{ height: 10 }} />

          <div className="cf-sub" style={{ marginBottom: 6 }}>
            {t('settings.cliPath')}
          </div>
          <div className="cf-row" style={{ alignItems: 'center' }}>
            <input
              className="cf-input"
              value={cliPath}
              onChange={(e) => {
                setCliPath(e.target.value);
                setPathCheck('idle');
              }}
              placeholder={t('settings.cliPathPlaceholder')}
              style={{ flex: 1 }}
            />
            <button type="button" className="cf-btn" onClick={() => void onPick()}>
              {t('common.selectFile')}
            </button>
            <button type="button" className="cf-btn" onClick={() => void onDetect()}>
              {t('common.detect')}
            </button>
          </div>
          {pathHint ? (
            <div className={pathCheck === 'fail' ? 'cf-errorText' : 'cf-help'} style={{ marginTop: 6 }}>
              {pathHint}
            </div>
          ) : null}

          <div className="cf-help" style={{ marginTop: 6 }}>
            <a href="#/states" style={{ color: 'var(--gold)' }}>
              {t('common.viewGuide')}
            </a>
          </div>

          <div className="cf-divider" />

          <div className="cf-row cf-settingsPage__row">
            <div>
              <div className="cf-sub">
                <strong style={{ color: 'var(--text)' }}>{t('settings.autoStart')}</strong>
              </div>
              <div className="cf-help">{t('settings.autoStartHelp')}</div>
            </div>
            <button
              type="button"
              className={autoStartGateway ? 'cf-btn cf-btnGold cf-btnSmall' : 'cf-btn cf-btnSmall'}
              onClick={() => updateSettings({ autoStartGateway: !autoStartGateway })}
            >
              {autoStartGateway ? t('common.on') : t('common.off')}
            </button>
          </div>
        </div>

        <div className="cf-card cf-col6">
          <h3>{t('settings.execution')}</h3>
          <div className="cf-divider" />
          <div className="cf-sub" style={{ marginBottom: 6 }}>
            {t('settings.timeout')}
          </div>
          <input
            className="cf-input"
            type="number"
            min={1000}
            step={1000}
            value={timeoutMs}
            onChange={(e) => setTimeoutMs(Number(e.target.value || 0))}
          />
          <div className="cf-help">{t('settings.timeoutHelp')}</div>
          <div style={{ height: 10 }} />
          <div className="cf-sub" style={{ marginBottom: 6 }}>
            {t('settings.logLevel')}
          </div>
          <select
            className="cf-select"
            value={logLevel}
            onChange={(e) => updateSettings({ logLevel: e.target.value as typeof logLevel })}
          >
            <option value="debug">debug</option>
            <option value="info">info</option>
            <option value="warn">warn</option>
            <option value="error">error</option>
          </select>
          <div className="cf-help">{t('settings.logLevelHelp')}</div>
        </div>

        <div className="cf-card cf-col6">
          <h3>{t('settings.security')}</h3>
          <div className="cf-divider" />
          <div className="cf-sub">{t('settings.security1')}</div>
          <div className="cf-sub">{t('settings.security2')}</div>
          <div className="cf-sub">{t('settings.security3')}</div>
          <div style={{ height: 12 }} />
          <button
            type="button"
            className="cf-btn cf-btnGold"
            onClick={() =>
              (window as any).__cf_toast?.success?.(t('common.sampleRulesTitle'), t('common.sampleRulesBody'))
            }
          >
            {t('settings.rulesBtn')}
          </button>
        </div>

        <div className="cf-card cf-col12">
          <h3>{t('settings.about')}</h3>
          <div className="cf-divider" />
          <div className="cf-row" style={{ gap: 24, flexWrap: 'wrap' }}>
            <div className="cf-sub">
              <strong style={{ color: 'var(--text)' }}>{t('settings.appVersion')}</strong>：{appVersion || '—'}
            </div>
            <div className="cf-sub">
              <strong style={{ color: 'var(--text)' }}>{t('settings.versionLabel')}</strong>：{version || '—'}
            </div>
            <div className="cf-sub">{t('settings.license')}</div>
          </div>
        </div>

        <div className="cf-card cf-col12">
          <h3>{t('settings.modelsTitle')}</h3>
          <div className="cf-divider" />

          <div className="cf-help">{t('settings.modelsHint')}</div>
          <div style={{ height: 10 }} />

          <div className="cf-row cf-settingsPage__row" style={{ alignItems: 'flex-start' }}>
            <div>
              <div className="cf-sub">
                <strong style={{ color: 'var(--text)' }}>{t('settings.currentModel')}</strong>
              </div>
              <div className="cf-help">{defaultModelId || t('common.unknown')}</div>
              {configuredProviders.length ? (
                <div className="cf-help" style={{ marginTop: 6 }}>
                  {t('settings.configuredProviders')}: {configuredProviders.join(', ')}
                </div>
              ) : null}
            </div>
            <div style={{ flex: 1 }}>
              <div className="cf-sub" style={{ marginBottom: 6 }}>
                <strong style={{ color: 'var(--text)' }}>{t('settings.configuredModels')}</strong>
              </div>
              {configuredModels.length === 0 ? (
                <div className="cf-help">{t('settings.noConfiguredModels')}</div>
              ) : (
                <div className="cf-row" style={{ gap: 8 }}>
                  {configuredModels.map((m) => (
                    <span
                      key={m.id}
                      className="cf-badge"
                      style={{
                        border: '1px solid rgba(255,255,255,.08)',
                        background: 'rgba(255,255,255,.02)',
                        borderRadius: 999,
                        padding: '6px 10px',
                        fontSize: 12,
                      }}
                      title={(m.tags ?? []).join(', ')}
                    >
                      {m.id}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="cf-row cf-settingsPage__row">
            <div>
              <div className="cf-sub">
                <strong style={{ color: 'var(--text)' }}>{t('settings.modelProvider')}</strong>
              </div>
              <div className="cf-help">{t('settings.modelProviderHint')}</div>
            </div>
            <select className="cf-select" value={modelProvider} onChange={(e) => setModelProvider(e.target.value as any)}>
              <option value="deepseek">DeepSeek</option>
              <option value="openai">OpenAI</option>
            </select>
          </div>

          <div style={{ height: 10 }} />

          <div className="cf-sub" style={{ marginBottom: 6 }}>
            {t('settings.modelToken')}
          </div>
          <input
            className="cf-input"
            value={modelToken}
            onChange={(e) => setModelToken(e.target.value)}
            placeholder={t('settings.modelTokenPh')}
          />
          <div className="cf-help">{t('settings.modelTokenHint')}</div>

          <div style={{ height: 10 }} />

          <div className="cf-sub" style={{ marginBottom: 6 }}>
            {t('settings.defaultModel')}
          </div>
          <input
            className="cf-input"
            value={defaultModelId}
            onChange={(e) => setDefaultModelId(e.target.value)}
            placeholder="deepseek/deepseek-chat"
          />
          <div className="cf-help">{t('settings.defaultModelHint')}</div>

          <div style={{ height: 12 }} />
          <button className="cf-btn cf-btnPrimary" type="button" disabled={modelSaving} onClick={() => void onSaveModel()}>
            {modelSaving ? t('settings.modelSaving') : t('settings.modelSave')}
          </button>
        </div>
      </section>
    </>
  );
};

export default SettingsPage;
