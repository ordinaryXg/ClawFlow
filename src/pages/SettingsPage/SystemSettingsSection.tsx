import { FC, useCallback, useEffect, useMemo, useState } from 'react';
import { Checkbox } from 'antd';
import { useTranslation } from 'react-i18next';
import i18n from '../../i18n';
import { CfSelectWithHints } from '../../components/CfSelectWithHints';
import { useSettingsStore } from '../../store/modules/settingsStore';
import {
  OUTBOUND_MERGE_WINDOW_PREFS_EVENT,
  setCachedOutboundMergeWindowMs,
} from '../../shared/outbound-merge-window-client';

type WebSearchProviderUi = 'auto' | 'bocha' | 'brave' | 'duckduckgo' | 'searxng';

const SystemSettingsSection: FC = () => {
  const { t } = useTranslation();
  const { theme, language, logLevel, closeButtonAction, uiFontSize, updateSettings } = useSettingsStore();

  const [appCacheSettings, setAppCacheSettings] = useState<{
    effectiveRoot: string;
    defaultRoot: string;
    configuredRoot: string | null;
  } | null>(null);
  const [appCacheBusy, setAppCacheBusy] = useState(false);

  const [wsEnabled, setWsEnabled] = useState(true);
  const [wsProvider, setWsProvider] = useState<WebSearchProviderUi>('searxng');
  const [wsBochaBase, setWsBochaBase] = useState('');
  const [wsBraveBase, setWsBraveBase] = useState('');
  const [wsSearxBase, setWsSearxBase] = useState('');
  const [wsTimeout, setWsTimeout] = useState(25);
  const [wsBochaKeyDraft, setWsBochaKeyDraft] = useState('');
  const [wsBraveKeyDraft, setWsBraveKeyDraft] = useState('');
  const [wsSearxKeyDraft, setWsSearxKeyDraft] = useState('');
  const [wsBochaSavedInFile, setWsBochaSavedInFile] = useState(false);
  const [wsBraveSavedInFile, setWsBraveSavedInFile] = useState(false);
  const [wsSearxKeySavedInFile, setWsSearxKeySavedInFile] = useState(false);
  const [wsBochaConfigured, setWsBochaConfigured] = useState(false);
  const [wsBraveConfigured, setWsBraveConfigured] = useState(false);
  const [wsSearxKeyConfigured, setWsSearxKeyConfigured] = useState(false);
  const [wsClearBochaOnSave, setWsClearBochaOnSave] = useState(false);
  const [wsClearBraveOnSave, setWsClearBraveOnSave] = useState(false);
  const [wsClearSearxOnSave, setWsClearSearxOnSave] = useState(false);

  const [toolLoopSteps, setToolLoopSteps] = useState(9);
  const [toolLoopStepsMin, setToolLoopStepsMin] = useState(1);
  const [toolLoopStepsMax, setToolLoopStepsMax] = useState(24);
  const [toolLoopStepsDefault, setToolLoopStepsDefault] = useState(9);
  const [outboundMergeWindowMs, setOutboundMergeWindowMs] = useState(3000);
  const [outboundMergeWindowMin, setOutboundMergeWindowMin] = useState(500);
  const [outboundMergeWindowMax, setOutboundMergeWindowMax] = useState(60_000);
  const [outboundMergeWindowDefault, setOutboundMergeWindowDefault] = useState(3000);
  const [engineRuntimeSaving, setEngineRuntimeSaving] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const rt = await window.electronAPI?.engineGetRuntimeSettings?.();
        if (rt) {
          setToolLoopSteps(rt.maxSendMessageToolLoopSteps);
          setToolLoopStepsMin(rt.minMaxSendMessageToolLoopSteps);
          setToolLoopStepsMax(rt.maxMaxSendMessageToolLoopSteps);
          setToolLoopStepsDefault(rt.defaultMaxSendMessageToolLoopSteps);
          setOutboundMergeWindowMs(rt.outboundMergeWindowMs);
          setOutboundMergeWindowMin(rt.minOutboundMergeWindowMs);
          setOutboundMergeWindowMax(rt.maxOutboundMergeWindowMs);
          setOutboundMergeWindowDefault(rt.defaultOutboundMergeWindowMs);
          setCachedOutboundMergeWindowMs(rt.outboundMergeWindowMs);
        }
      } catch {
        /* ignore */
      }
      try {
        const s = await window.electronAPI?.engineGetWebSearchSettings?.();
        if (s) {
          setWsEnabled(s.enabled);
          setWsProvider(s.provider);
          setWsBochaBase(s.bochaBaseUrl ?? '');
          setWsBraveBase(s.braveBaseUrl ?? '');
          setWsSearxBase(s.searxngBaseUrl ?? '');
          setWsTimeout(s.timeoutSeconds ?? 25);
          setWsBochaSavedInFile(Boolean(s.bochaApiKeySavedInFile));
          setWsBraveSavedInFile(s.braveApiKeySavedInFile);
          setWsSearxKeySavedInFile(Boolean(s.searxngApiKeySavedInFile));
          setWsBochaConfigured(s.bochaApiKeyConfigured);
          setWsBraveConfigured(s.braveApiKeyConfigured);
          setWsSearxKeyConfigured(s.searxngApiKeyConfigured);
          setWsBochaKeyDraft('');
          setWsBraveKeyDraft('');
          setWsSearxKeyDraft('');
          setWsClearBochaOnSave(false);
          setWsClearBraveOnSave(false);
          setWsClearSearxOnSave(false);
        }
      } catch {
        /* ignore */
      }
      try {
        if (window.electronAPI?.appGetAppCacheSettings) {
          const r = await window.electronAPI.appGetAppCacheSettings();
          setAppCacheSettings(r);
        } else {
          setAppCacheSettings(null);
        }
      } catch {
        setAppCacheSettings(null);
      }
    })();
  }, []);

  const onSaveEngineRuntimeSettings = async () => {
    const n = Math.floor(Number(toolLoopSteps));
    const mergeMs = Math.floor(Number(outboundMergeWindowMs));
    if (!Number.isFinite(n) || n < toolLoopStepsMin || n > toolLoopStepsMax) {
      (window as any).__cf_toast?.error?.(
        t('settings.engineRuntimeSaveFail'),
        t('settings.engineRuntimeErr_invalid_steps', { min: toolLoopStepsMin, max: toolLoopStepsMax }),
      );
      return;
    }
    if (!Number.isFinite(mergeMs) || mergeMs < outboundMergeWindowMin || mergeMs > outboundMergeWindowMax) {
      (window as any).__cf_toast?.error?.(
        t('settings.engineRuntimeSaveFail'),
        t('settings.engineRuntimeErr_invalid_merge_window', {
          min: outboundMergeWindowMin,
          max: outboundMergeWindowMax,
        }),
      );
      return;
    }
    setEngineRuntimeSaving(true);
    try {
      const res = await window.electronAPI?.engineSaveRuntimeSettings?.({
        maxSendMessageToolLoopSteps: n,
        outboundMergeWindowMs: mergeMs,
      });
      if (res && 'ok' in res && res.ok === false) {
        const err = String((res as { error?: string }).error ?? '');
        const msg =
          err === 'invalid_steps'
            ? t('settings.engineRuntimeErr_invalid_steps', { min: toolLoopStepsMin, max: toolLoopStepsMax })
            : err === 'invalid_merge_window'
              ? t('settings.engineRuntimeErr_invalid_merge_window', {
                  min: outboundMergeWindowMin,
                  max: outboundMergeWindowMax,
                })
              : err || t('common.sampleOpFailBody');
        (window as any).__cf_toast?.error?.(t('settings.engineRuntimeSaveFail'), msg);
        return;
      }
      if (res && 'ok' in res && res.ok) {
        setToolLoopSteps(res.maxSendMessageToolLoopSteps);
        setOutboundMergeWindowMs(res.outboundMergeWindowMs);
        setCachedOutboundMergeWindowMs(res.outboundMergeWindowMs);
        window.dispatchEvent(new CustomEvent(OUTBOUND_MERGE_WINDOW_PREFS_EVENT));
      }
      (window as any).__cf_toast?.success?.(t('settings.savedTitle'), t('settings.engineRuntimeSavedBody'));
    } catch (e: any) {
      (window as any).__cf_toast?.error?.(t('settings.engineRuntimeSaveFail'), e?.message || t('common.sampleOpFailBody'));
    } finally {
      setEngineRuntimeSaving(false);
    }
  };

  const onSaveWebSearchSettings = async () => {
    try {
      await window.electronAPI?.engineSaveWebSearchSettings?.({
        enabled: wsEnabled,
        provider: wsProvider,
        bochaBaseUrl: wsBochaBase,
        braveBaseUrl: wsBraveBase,
        searxngBaseUrl: wsSearxBase,
        timeoutSeconds: wsTimeout,
        clearBochaApiKey: wsClearBochaOnSave,
        ...(wsBochaKeyDraft.trim() ? { bochaApiKey: wsBochaKeyDraft.trim() } : {}),
        clearBraveApiKey: wsClearBraveOnSave,
        ...(wsBraveKeyDraft.trim() ? { braveApiKey: wsBraveKeyDraft.trim() } : {}),
        clearSearxngApiKey: wsClearSearxOnSave,
        ...(wsSearxKeyDraft.trim() ? { searxngApiKey: wsSearxKeyDraft.trim() } : {}),
      });
      setWsClearBochaOnSave(false);
      setWsClearBraveOnSave(false);
      setWsClearSearxOnSave(false);
      setWsBochaKeyDraft('');
      setWsBraveKeyDraft('');
      setWsSearxKeyDraft('');
      const s2 = await window.electronAPI?.engineGetWebSearchSettings?.();
      if (s2) {
        setWsBochaSavedInFile(Boolean(s2.bochaApiKeySavedInFile));
        setWsBraveSavedInFile(s2.braveApiKeySavedInFile);
        setWsSearxKeySavedInFile(Boolean(s2.searxngApiKeySavedInFile));
        setWsBochaConfigured(s2.bochaApiKeyConfigured);
        setWsBraveConfigured(s2.braveApiKeyConfigured);
        setWsSearxKeyConfigured(s2.searxngApiKeyConfigured);
      }
      (window as any).__cf_toast?.success?.(t('settings.savedTitle'), t('settings.webSearchSavedBody'));
    } catch (e: any) {
      (window as any).__cf_toast?.error?.(t('settings.webSearchSaveFail'), e?.message || t('common.sampleOpFailBody'));
    }
  };

  const reloadAppCacheSettings = useCallback(async () => {
    if (!window.electronAPI?.appGetAppCacheSettings) {
      setAppCacheSettings(null);
      return;
    }
    try {
      const r = await window.electronAPI.appGetAppCacheSettings();
      setAppCacheSettings(r);
    } catch {
      setAppCacheSettings(null);
    }
  }, []);

  const onPickAppCacheRoot = async () => {
    const picked = await window.electronAPI?.workspacePickFolder?.({ title: t('settings.appCachePickTitle') });
    if (!picked?.trim()) return;
    if (!window.confirm(t('settings.appCachePickConfirm', { path: picked.trim() }))) return;
    if (!window.electronAPI?.appSetAppCacheRoot) return;
    setAppCacheBusy(true);
    try {
      const res = await window.electronAPI.appSetAppCacheRoot(picked.trim());
      if (res.ok) {
        await reloadAppCacheSettings();
        (window as any).__cf_toast?.success?.(t('settings.savedTitle'), t('settings.appCacheSaved'));
      } else {
        (window as any).__cf_toast?.error?.(t('settings.appCacheSaveFail'), res.error);
      }
    } finally {
      setAppCacheBusy(false);
    }
  };

  const onResetAppCacheRoot = async () => {
    if (!window.confirm(t('settings.appCacheResetConfirm'))) return;
    if (!window.electronAPI?.appSetAppCacheRoot) return;
    setAppCacheBusy(true);
    try {
      const res = await window.electronAPI.appSetAppCacheRoot(null);
      if (res.ok) {
        await reloadAppCacheSettings();
        (window as any).__cf_toast?.success?.(t('settings.savedTitle'), t('settings.appCacheSaved'));
      } else {
        (window as any).__cf_toast?.error?.(t('settings.appCacheSaveFail'), res.error);
      }
    } finally {
      setAppCacheBusy(false);
    }
  };



  const logLevelSelectOptions = useMemo(
    () => [
      { value: 'debug', label: 'debug', hint: t('settings.logLevelHint_debug') },
      { value: 'info', label: 'info', hint: t('settings.logLevelHint_info') },
      { value: 'warn', label: 'warn', hint: t('settings.logLevelHint_warn') },
      { value: 'error', label: 'error', hint: t('settings.logLevelHint_error') },
    ],
    [t],
  );

  const closeButtonSelectOptions = useMemo(
    () => [
      { value: 'quit', label: t('settings.closeButton_quit'), hint: t('settings.closeButtonHint_quit') },
      { value: 'minimizeToTray', label: t('settings.closeButton_tray'), hint: t('settings.closeButtonHint_tray') },
    ],
    [t],
  );

  const webSearchProviderSelectOptions = useMemo(
    () => [
      { value: 'auto', label: t('settings.webSearchProvider_auto'), hint: t('settings.webSearchHint_auto') },
      { value: 'searxng', label: t('settings.webSearchProvider_searxng'), hint: t('settings.webSearchHint_searxng') },
      { value: 'bocha', label: t('settings.webSearchProvider_bocha'), hint: t('settings.webSearchHint_bocha') },
      { value: 'duckduckgo', label: t('settings.webSearchProvider_ddg'), hint: t('settings.webSearchHint_ddg') },
      { value: 'brave', label: t('settings.webSearchProvider_brave'), hint: t('settings.webSearchHint_brave') },
    ],
    [t],
  );
  return (
      <>
        <div className="cf-card">
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
                onClick={() => {
                  updateSettings({ language: 'zh' });
                  void i18n.changeLanguage('zh');
                }}
              >
                {t('common.chinese')}
              </button>
              <button
                type="button"
                className={language === 'en' ? 'cf-btn cf-btnGold cf-btnSmall' : 'cf-btn cf-btnSmall'}
                onClick={() => {
                  updateSettings({ language: 'en' });
                  void i18n.changeLanguage('en');
                }}
              >
                {t('common.english')}
              </button>
            </div>
          </div>

          <div style={{ height: 10 }} />

          <div className="cf-row cf-settingsPage__row">
            <div>
              <div className="cf-sub">
                <strong style={{ color: 'var(--text)' }}>{t('settings.fontSizeTitle')}</strong>
              </div>
              <div className="cf-help">{t('settings.fontSizeHelp')}</div>
            </div>
            <div className="cf-row" style={{ flexWrap: 'wrap', gap: 8 }}>
              {(['sm', 'md', 'lg', 'xl'] as const).map((sz) => (
                <button
                  key={sz}
                  type="button"
                  className={uiFontSize === sz ? 'cf-btn cf-btnGold cf-btnSmall' : 'cf-btn cf-btnSmall'}
                  onClick={() => updateSettings({ uiFontSize: sz })}
                >
                  {t(`settings.fontSize_${sz}`)}
                </button>
              ))}
            </div>
          </div>

          <div style={{ height: 10 }} />

          <div className="cf-row cf-settingsPage__row">
            <div>
              <div className="cf-sub">
                <strong style={{ color: 'var(--text)' }}>{t('settings.logLevel')}</strong>
              </div>
              <div className="cf-help">{t('settings.logLevelHelp')}</div>
            </div>
            <div style={{ minWidth: 220, flex: '1 1 200px' }}>
              <CfSelectWithHints
                className="cf-selectHint--wide"
                value={logLevel}
                onChange={(v) => updateSettings({ logLevel: v as typeof logLevel })}
                options={logLevelSelectOptions}
                hintIconAriaBase={t('common.selectOptionHintAria')}
                aria-label={t('settings.logLevel')}
              />
            </div>
          </div>
        </div>

        <div className="cf-card">
          <h3>{t('settings.engineRuntimeTitle')}</h3>
          <div className="cf-divider" />
          <div className="cf-row cf-settingsPage__row" style={{ marginBottom: 12 }}>
            <div>
              <div className="cf-sub">
                <strong style={{ color: 'var(--text)' }}>{t('settings.engineRuntimeToolLoopSteps')}</strong>
              </div>
              <div className="cf-help">{t('settings.engineRuntimeToolLoopStepsHelp')}</div>
              <div className="cf-help" style={{ marginTop: 6 }}>
                {t('settings.engineRuntimeToolLoopStepsRange', {
                  min: toolLoopStepsMin,
                  max: toolLoopStepsMax,
                  default: toolLoopStepsDefault,
                })}
              </div>
            </div>
            <div className="cf-row" style={{ flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
              <input
                className="cf-input"
                type="number"
                min={toolLoopStepsMin}
                max={toolLoopStepsMax}
                step={1}
                style={{ width: 88 }}
                value={toolLoopSteps}
                onChange={(e) => {
                  const v = Number.parseInt(e.target.value, 10);
                  if (Number.isFinite(v)) setToolLoopSteps(v);
                }}
                aria-label={t('settings.engineRuntimeToolLoopSteps')}
              />
            </div>
          </div>

          <div style={{ height: 10 }} />

          <div className="cf-row cf-settingsPage__row" style={{ marginBottom: 12 }}>
            <div>
              <div className="cf-sub">
                <strong style={{ color: 'var(--text)' }}>{t('settings.engineRuntimeOutboundMergeWindow')}</strong>
              </div>
              <div className="cf-help">{t('settings.engineRuntimeOutboundMergeWindowHelp')}</div>
              <div className="cf-help" style={{ marginTop: 6 }}>
                {t('settings.engineRuntimeOutboundMergeWindowRange', {
                  min: outboundMergeWindowMin,
                  max: outboundMergeWindowMax,
                  default: outboundMergeWindowDefault,
                })}
              </div>
            </div>
            <div className="cf-row" style={{ flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
              <input
                className="cf-input"
                type="number"
                min={outboundMergeWindowMin}
                max={outboundMergeWindowMax}
                step={100}
                style={{ width: 100 }}
                value={outboundMergeWindowMs}
                onChange={(e) => {
                  const v = Number.parseInt(e.target.value, 10);
                  if (Number.isFinite(v)) setOutboundMergeWindowMs(v);
                }}
                aria-label={t('settings.engineRuntimeOutboundMergeWindow')}
              />
              <span className="cf-help">ms</span>
            </div>
          </div>

          <div className="cf-row" style={{ justifyContent: 'flex-end' }}>
            <button
              type="button"
              className="cf-btn cf-btnPrimary cf-btnSmall"
              disabled={engineRuntimeSaving}
              onClick={() => void onSaveEngineRuntimeSettings()}
            >
              {engineRuntimeSaving ? t('settings.engineRuntimeSaving') : t('settings.engineRuntimeSave')}
            </button>
          </div>
        </div>

        <div className="cf-card">
          <h3>{t('settings.closeButtonTitle')}</h3>
          <div className="cf-divider" />
          <div className="cf-help" style={{ marginBottom: 12 }}>
            {t('settings.closeButtonHelp')}
          </div>
          <CfSelectWithHints
            className="cf-selectHint--wide"
            value={closeButtonAction}
            onChange={(v) => updateSettings({ closeButtonAction: v as typeof closeButtonAction })}
            options={closeButtonSelectOptions}
            hintIconAriaBase={t('common.selectOptionHintAria')}
            aria-label={t('settings.closeButtonTitle')}
          />
        </div>

        <div className="cf-card">
          <h3>{t('settings.appCacheTitle')}</h3>
          <div className="cf-divider" />
          <div className="cf-help" style={{ marginBottom: 10 }}>
            {t('settings.appCacheHelp')}
          </div>
          <div className="cf-help" style={{ marginBottom: 8 }}>
            {t('settings.appCacheBuiltInHint', { path: appCacheSettings?.defaultRoot ?? '—' })}
          </div>
          <div className="cf-settingsModels__mono" style={{ wordBreak: 'break-all', marginBottom: 8 }}>
            {appCacheSettings?.effectiveRoot ?? '—'}
          </div>
          {appCacheSettings?.configuredRoot ? (
            <div className="cf-sub" style={{ marginBottom: 12, wordBreak: 'break-all' }}>
              {t('settings.appCacheConfiguredLabel')} {appCacheSettings.configuredRoot}
            </div>
          ) : null}
          <div className="cf-row" style={{ flexWrap: 'wrap', gap: 8 }}>
            <button
              className="cf-btn cf-btnPrimary cf-btnSmall"
              type="button"
              disabled={appCacheBusy || !window.electronAPI?.appSetAppCacheRoot}
              onClick={() => void onPickAppCacheRoot()}
            >
              {t('settings.appCachePick')}
            </button>
            <button
              className="cf-btn cf-btnGhost cf-btnSmall"
              type="button"
              disabled={appCacheBusy || !window.electronAPI?.appSetAppCacheRoot}
              onClick={() => void onResetAppCacheRoot()}
            >
              {t('settings.appCacheResetBuiltIn')}
            </button>
          </div>
        </div>

        <div className="cf-card">
          <h3>{t('settings.webSearchTitle')}</h3>
          <div className="cf-divider" />
          <div className="cf-help" style={{ marginBottom: 12 }}>
            {t('settings.webSearchHelp')}
          </div>
          <div style={{ marginBottom: 14 }}>
            <Checkbox checked={wsEnabled} onChange={(e) => setWsEnabled(e.target.checked)}>
              {t('settings.webSearchEnabled')}
            </Checkbox>
            <div className="cf-help" style={{ marginTop: 6 }}>
              {t('settings.webSearchEnabledHelp')}
            </div>
          </div>
          <div className="cf-row cf-settingsPage__row" style={{ marginBottom: 12 }}>
            <div>
              <div className="cf-sub">
                <strong style={{ color: 'var(--text)' }}>{t('settings.webSearchProvider')}</strong>
              </div>
              <div className="cf-help">{t('settings.webSearchProviderHelp')}</div>
            </div>
            <div style={{ minWidth: 220, flex: '1 1 200px' }}>
              <CfSelectWithHints
                className="cf-selectHint--wide"
                value={wsProvider}
                onChange={(v) => setWsProvider(v as WebSearchProviderUi)}
                options={webSearchProviderSelectOptions}
                hintIconAriaBase={t('common.selectOptionHintAria')}
                aria-label={t('settings.webSearchProvider')}
              />
            </div>
          </div>
          <div className="cf-sub" style={{ marginBottom: 6 }}>
            {t('settings.webSearchBochaBase')}
          </div>
          <input
            className="cf-input"
            style={{ width: '100%', marginBottom: 10 }}
            value={wsBochaBase}
            onChange={(e) => setWsBochaBase(e.target.value)}
            placeholder={t('settings.webSearchBochaBasePh')}
            autoComplete="off"
          />
          <div className="cf-sub" style={{ marginBottom: 6 }}>
            {t('settings.webSearchBraveBase')}
          </div>
          <input
            className="cf-input"
            style={{ width: '100%', marginBottom: 10 }}
            value={wsBraveBase}
            onChange={(e) => setWsBraveBase(e.target.value)}
            placeholder={t('settings.webSearchBraveBasePh')}
            autoComplete="off"
          />
          <div className="cf-sub" style={{ marginBottom: 6 }}>
            {t('settings.webSearchSearxBase')}
          </div>
          <input
            className="cf-input"
            style={{ width: '100%', marginBottom: 10 }}
            value={wsSearxBase}
            onChange={(e) => setWsSearxBase(e.target.value)}
            placeholder={t('settings.webSearchSearxBasePh')}
            autoComplete="off"
          />
          <div className="cf-row cf-settingsPage__row" style={{ marginBottom: 12, alignItems: 'center' }}>
            <div>
              <div className="cf-sub">
                <strong style={{ color: 'var(--text)' }}>{t('settings.webSearchTimeout')}</strong>
              </div>
              <div className="cf-help">{t('settings.webSearchTimeoutHelp')}</div>
            </div>
            <input
              className="cf-input"
              type="number"
              min={5}
              max={120}
              style={{ width: 100 }}
              value={wsTimeout}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (Number.isFinite(n)) setWsTimeout(Math.max(5, Math.min(120, Math.round(n))));
              }}
            />
          </div>
          <div className="cf-sub" style={{ marginBottom: 6 }}>
            {t('settings.webSearchBochaKey')}
          </div>
          <input
            className="cf-input"
            type="password"
            style={{ width: '100%', marginBottom: 6 }}
            value={wsBochaKeyDraft}
            onChange={(e) => setWsBochaKeyDraft(e.target.value)}
            placeholder={t('settings.webSearchBochaKeyPh')}
            autoComplete="new-password"
          />
          <div className="cf-help" style={{ marginBottom: 8 }}>
            {wsBochaConfigured
              ? t('settings.webSearchKeyStatus_active')
              : t('settings.webSearchKeyStatus_missing')}
            {wsBochaSavedInFile ? ` · ${t('settings.webSearchKeyStatus_savedFile')}` : ''}
          </div>
          {wsBochaSavedInFile ? (
            <div className="cf-row" style={{ flexWrap: 'wrap', gap: 8, marginBottom: 14, alignItems: 'center' }}>
              {wsClearBochaOnSave ? (
                <>
                  <span className="cf-help" style={{ color: 'var(--warning, #c9a227)' }}>
                    {t('settings.webSearchKeyClearPending')}
                  </span>
                  <button type="button" className="cf-btn cf-btnGhost cf-btnSmall" onClick={() => setWsClearBochaOnSave(false)}>
                    {t('settings.webSearchKeyClearCancel')}
                  </button>
                </>
              ) : (
                <button type="button" className="cf-btn cf-btnGhost cf-btnSmall" onClick={() => setWsClearBochaOnSave(true)}>
                  {t('settings.webSearchBochaKeyClear')}
                </button>
              )}
            </div>
          ) : (
            <div style={{ height: 4, marginBottom: 10 }} />
          )}
          <div className="cf-sub" style={{ marginBottom: 6 }}>
            {t('settings.webSearchBraveKey')}
          </div>
          <input
            className="cf-input"
            type="password"
            style={{ width: '100%', marginBottom: 6 }}
            value={wsBraveKeyDraft}
            onChange={(e) => setWsBraveKeyDraft(e.target.value)}
            placeholder={t('settings.webSearchBraveKeyPh')}
            autoComplete="new-password"
          />
          <div className="cf-help" style={{ marginBottom: 8 }}>
            {wsBraveConfigured
              ? t('settings.webSearchKeyStatus_active')
              : t('settings.webSearchKeyStatus_missing')}
            {wsBraveSavedInFile ? ` · ${t('settings.webSearchKeyStatus_savedFile')}` : ''}
          </div>
          {wsBraveSavedInFile ? (
            <div className="cf-row" style={{ flexWrap: 'wrap', gap: 8, marginBottom: 14, alignItems: 'center' }}>
              {wsClearBraveOnSave ? (
                <>
                  <span className="cf-help" style={{ color: 'var(--warning, #c9a227)' }}>
                    {t('settings.webSearchKeyClearPending')}
                  </span>
                  <button type="button" className="cf-btn cf-btnGhost cf-btnSmall" onClick={() => setWsClearBraveOnSave(false)}>
                    {t('settings.webSearchKeyClearCancel')}
                  </button>
                </>
              ) : (
                <button type="button" className="cf-btn cf-btnGhost cf-btnSmall" onClick={() => setWsClearBraveOnSave(true)}>
                  {t('settings.webSearchBraveKeyClear')}
                </button>
              )}
            </div>
          ) : (
            <div style={{ height: 4, marginBottom: 10 }} />
          )}
          <div className="cf-sub" style={{ marginBottom: 6 }}>
            {t('settings.webSearchSearxKey')}
          </div>
          <input
            className="cf-input"
            type="password"
            style={{ width: '100%', marginBottom: 6 }}
            value={wsSearxKeyDraft}
            onChange={(e) => setWsSearxKeyDraft(e.target.value)}
            placeholder={t('settings.webSearchSearxKeyPh')}
            autoComplete="new-password"
          />
          <div className="cf-help" style={{ marginBottom: 8 }}>
            {wsSearxKeyConfigured
              ? t('settings.webSearchKeyStatus_active')
              : t('settings.webSearchKeyStatus_missing')}
            {wsSearxKeySavedInFile ? ` · ${t('settings.webSearchKeyStatus_savedFile')}` : ''}
          </div>
          {wsSearxKeySavedInFile ? (
            <div className="cf-row" style={{ flexWrap: 'wrap', gap: 8, marginBottom: 8, alignItems: 'center' }}>
              {wsClearSearxOnSave ? (
                <>
                  <span className="cf-help" style={{ color: 'var(--warning, #c9a227)' }}>
                    {t('settings.webSearchKeyClearPending')}
                  </span>
                  <button type="button" className="cf-btn cf-btnGhost cf-btnSmall" onClick={() => setWsClearSearxOnSave(false)}>
                    {t('settings.webSearchKeyClearCancel')}
                  </button>
                </>
              ) : (
                <button type="button" className="cf-btn cf-btnGhost cf-btnSmall" onClick={() => setWsClearSearxOnSave(true)}>
                  {t('settings.webSearchSearxKeyClear')}
                </button>
              )}
            </div>
          ) : null}
          <div className="cf-row" style={{ flexWrap: 'wrap', gap: 8, marginTop: 12, alignItems: 'center' }}>
            <button type="button" className="cf-btn cf-btnPrimary cf-btnSmall" onClick={() => void onSaveWebSearchSettings()}>
              {t('settings.webSearchSaveButton')}
            </button>
            <span className="cf-help">{t('settings.webSearchSaveHint')}</span>
          </div>
        </div>

        <div className="cf-card">
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
      </>
  );
};

export default SystemSettingsSection;
