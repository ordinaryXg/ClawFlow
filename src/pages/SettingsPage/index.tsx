import type { ReactNode } from 'react';
import { FC, useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import i18n from '../../i18n';
import './styles.css';
import { useGatewayStore } from '../../store/modules/gatewayStore';
import { useSettingsStore } from '../../store/modules/settingsStore';
import { useWorkspaceStore } from '../../store/modules/workspaceStore';
const SETTINGS_SECTION_IDS = ['account', 'system', 'memory', 'models', 'integrations', 'data', 'help'] as const;
type SettingsSectionId = (typeof SETTINGS_SECTION_IDS)[number];

const NAV_LABEL_KEYS: Record<SettingsSectionId, string> = {
  account: 'settings.navAccount',
  system: 'settings.navSystem',
  memory: 'settings.navMemory',
  models: 'settings.navModels',
  integrations: 'settings.navIntegrations',
  data: 'settings.navData',
  help: 'settings.navHelp',
};

const SECTION_META: Record<SettingsSectionId, { titleKey: string; hintKey: string }> = {
  account: { titleKey: 'settings.sectionAccountTitle', hintKey: 'settings.sectionAccountHint' },
  system: { titleKey: 'settings.sectionSystemTitle', hintKey: 'settings.sectionSystemHint' },
  memory: { titleKey: 'settings.sectionMemoryTitle', hintKey: 'settings.sectionMemoryHint' },
  models: { titleKey: 'settings.sectionModelsTitle', hintKey: 'settings.sectionModelsHint' },
  integrations: { titleKey: 'settings.sectionIntegrationsTitle', hintKey: 'settings.sectionIntegrationsHint' },
  data: { titleKey: 'settings.sectionDataTitle', hintKey: 'settings.sectionDataHint' },
  help: { titleKey: 'settings.sectionHelpTitle', hintKey: 'settings.sectionHelpHint' },
};

const SettingsPage: FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const {
    status: gatewayStatus,
    isStarting,
    isStopping,
    error: gatewayError,
    port: gatewayPort,
    uptimeMs: gatewayUptimeMs,
    logs: gatewayLogs,
    fetchStatus,
    startGateway,
    stopGateway,
    restartGateway,
    fetchLogs,
  } = useGatewayStore();
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

  const activeWorkspacePath = useWorkspaceStore((s) => s.activePath);
  const workspaceMeta = useWorkspaceStore((s) => s.meta);
  const workspaceLoading = useWorkspaceStore((s) => s.loading);
  const refreshWorkspace = useWorkspaceStore((s) => s.refresh);
  const pickWorkspaceFolder = useWorkspaceStore((s) => s.pickFolder);

  const [activeSection, setActiveSection] = useState<SettingsSectionId>('account');
  const [connectorCount, setConnectorCount] = useState(0);

  const [cliPath, setCliPath] = useState(storeCliPath);
  const [timeoutMs, setTimeoutMs] = useState(storeTimeout);
  const [pathCheck, setPathCheck] = useState<'idle' | 'ok' | 'fail'>('idle');
  const [appVersion, setAppVersion] = useState<string>('');
  const [modelProvider, setModelProvider] = useState<'deepseek' | 'openai' | 'anthropic'>('deepseek');
  const [modelProfileLabel, setModelProfileLabel] = useState('');
  const [modelToken, setModelToken] = useState('');
  const [modelSaving, setModelSaving] = useState(false);
  const [cliAvailable, setCliAvailable] = useState<boolean | null>(null);
  const [cliError, setCliError] = useState<string>('');
  const [builtinCatalog, setBuiltinCatalog] = useState<{
    defaultModelId: string | null;
    models: Array<{ id: string; label: string; available: boolean }>;
  } | null>(null);
  const [builtinCatalogLoading, setBuiltinCatalogLoading] = useState(false);

  useEffect(() => {
    setCliPath(storeCliPath);
    setTimeoutMs(storeTimeout);
  }, [storeCliPath, storeTimeout]);

  useEffect(() => {
    if (window.electronAPI?.validateCLI) {
      window.electronAPI
        .validateCLI()
        .then((available: boolean) => {
          setCliAvailable(available);
          setCliError(available ? '' : t('settings.cliPathMissingDetail'));
        })
        .catch(() => {
          setCliAvailable(false);
          setCliError(t('settings.cliPathCheckFailed'));
        });
    }
    void (async () => {
      try {
        const v = await window.electronAPI?.getAppVersion?.();
        if (v) setAppVersion(v);
      } catch {
        setAppVersion('');
      }
    })();
  }, [t]);

  const reloadBuiltinCatalog = useCallback(async () => {
    if (!window.electronAPI?.engineGetChatModels) {
      setBuiltinCatalog(null);
      return;
    }
    setBuiltinCatalogLoading(true);
    try {
      const res = await window.electronAPI.engineGetChatModels();
      const def = typeof res?.defaultModelId === 'string' && res.defaultModelId.trim() ? res.defaultModelId.trim() : null;
      const list = Array.isArray(res?.models) ? res.models : [];
      setBuiltinCatalog({
        defaultModelId: def,
        models: list
          .map((m: any) => {
            const id = String(m?.id ?? '').trim();
            if (!id) return null;
            const label = String(m?.label ?? id).trim() || id;
            return { id, label, available: m?.available !== false };
          })
          .filter(Boolean) as Array<{ id: string; label: string; available: boolean }>,
      });
    } catch {
      setBuiltinCatalog(null);
    } finally {
      setBuiltinCatalogLoading(false);
    }
  }, []);

  const reloadConnectorsCount = useCallback(async () => {
    try {
      const res = await window.electronAPI?.getConnectors?.();
      const arr = res?.connectors;
      setConnectorCount(Array.isArray(arr) ? arr.length : 0);
    } catch {
      setConnectorCount(0);
    }
  }, []);

  useEffect(() => {
    if (activeSection !== 'models') return;
    void reloadBuiltinCatalog();
  }, [activeSection, activeWorkspacePath, reloadBuiltinCatalog]);

  useEffect(() => {
    if (activeSection !== 'integrations') return;
    void fetchStatus();
    void reloadConnectorsCount();
    void fetchLogs(80);
  }, [activeSection, fetchStatus, reloadConnectorsCount]);

  useEffect(() => {
    if (activeSection !== 'account') return;
    void refreshWorkspace();
  }, [activeSection, refreshWorkspace]);

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

  const refreshSettingsData = () => {
    void reloadBuiltinCatalog();
    void fetchStatus();
    void reloadConnectorsCount();
    if (window.electronAPI?.validateCLI) {
      window.electronAPI
        .validateCLI()
        .then((available: boolean) => {
          setCliAvailable(available);
          setCliError(available ? '' : t('settings.cliPathMissingDetail'));
        })
        .catch(() => {
          setCliAvailable(false);
          setCliError(t('settings.cliPathCheckFailed'));
        });
    }
    (window as any).__cf_toast?.success?.(t('common.toastRefreshOkTitle'), t('common.toastRefreshOkBody'));
  };

  const scrollToOpenClawPath = () => {
    setActiveSection('system');
    window.setTimeout(() => {
      document.getElementById('settings-system-openclaw')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 80);
  };

  const gatewayChip = useMemo(() => {
    if (gatewayStatus === 'running')
      return <span className="cf-chip cf-chipRunning">{t('gateway.statusRunning')}</span>;
    if (gatewayStatus === 'stopped')
      return <span className="cf-chip cf-chipStopped">{t('gateway.statusStopped')}</span>;
    return <span className="cf-chip cf-chipUnknown">{t('gateway.statusUnknown')}</span>;
  }, [gatewayStatus, t]);

  const handleStartGateway = async () => {
    if (cliAvailable === false) return;
    try {
      await startGateway();
      await fetchStatus();
      (window as any).__cf_toast?.success?.(t('common.sampleTitle'), t('gateway.startOkBody'));
    } catch (e: any) {
      (window as any).__cf_toast?.error?.(t('gateway.startFailTitle'), e?.message || t('common.sampleOpFailBody'));
    }
  };

  const handleStopGateway = async () => {
    if (cliAvailable === false) return;
    try {
      await stopGateway();
      await fetchStatus();
    } catch (e: any) {
      (window as any).__cf_toast?.error?.(t('common.sampleDetectFailTitle'), e?.message || t('common.sampleOpFailBody'));
    }
  };

  const onSaveModel = async () => {
    const provider = modelProvider;
    const token = modelToken.trim();
    const label = modelProfileLabel.trim();
    if (!token) {
      (window as any).__cf_toast?.error?.(t('settings.modelTokenRequiredTitle'), t('settings.modelTokenRequiredBody'));
      return;
    }

    setModelSaving(true);
    try {
      await window.electronAPI?.setModelAuthToken?.({ provider, token, profileId: `${provider}:manual`, label });
      setModelToken('');
      setModelProfileLabel('');
      void reloadBuiltinCatalog();
      (window as any).__cf_toast?.success?.(t('settings.modelSavedTitle'), t('settings.modelSavedBody'));
    } catch (e: any) {
      (window as any).__cf_toast?.error?.(t('settings.modelSaveFailTitle'), e?.message || t('common.sampleOpFailBody'));
    } finally {
      setModelSaving(false);
    }
  };

  const sectionHead = SECTION_META[activeSection];

  const panelModels = (
    <>
      <div className="cf-help">{t('settings.modelsHint')}</div>
      <div className="cf-help" style={{ marginTop: 6 }}>
        {t('settings.modelsLocalHint')}
      </div>

      <div className="cf-settingsModels cf-settingsModels--single" style={{ marginTop: 14 }}>
        <div className="cf-settingsModels__col">
          <div className="cf-settingsModels__sectionTitle">{t('settings.apiKeysSectionTitle')}</div>
          <div className="cf-help">{t('settings.apiKeysSectionLead')}</div>
          <div className="cf-help" style={{ marginTop: 6 }}>
            {t('settings.modelsKeysUnifiedHint')}
          </div>
          <div style={{ height: 10 }} />

          <div className="cf-sub" style={{ marginBottom: 6 }}>
            {t('settings.modelProfileName')}
          </div>
          <input
            className="cf-input"
            value={modelProfileLabel}
            onChange={(e) => setModelProfileLabel(e.target.value)}
            placeholder={t('settings.modelProfileNamePh')}
          />
          <div className="cf-help">{t('settings.modelProfileNameHint')}</div>
          <div style={{ height: 10 }} />

          <div className="cf-sub" style={{ marginBottom: 6 }}>
            {t('settings.modelProvider')}
          </div>
          <select
            className="cf-select"
            value={modelProvider}
            onChange={(e) => setModelProvider(e.target.value as 'deepseek' | 'openai' | 'anthropic')}
          >
            <option value="deepseek">DeepSeek</option>
            <option value="openai">OpenAI</option>
            <option value="anthropic">Anthropic</option>
          </select>

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

          <div style={{ height: 12 }} />
          <button className="cf-btn cf-btnPrimary" type="button" disabled={modelSaving} onClick={() => void onSaveModel()}>
            {modelSaving ? t('settings.modelSaving') : t('settings.modelSave')}
          </button>
        </div>
      </div>

      <div className="cf-settingsModelsStack">
        <div className="cf-settingsSubHead">
          <div className="cf-settingsModels__sectionTitle" style={{ marginBottom: 0 }}>
            {t('settings.builtinModelsTitle')}
          </div>
          <button className="cf-btn cf-btnGhost cf-btnSmall" type="button" disabled={builtinCatalogLoading} onClick={() => void reloadBuiltinCatalog()}>
            {builtinCatalogLoading ? t('settings.refreshingBuiltin') : t('settings.builtinCatalogRefresh')}
          </button>
        </div>
        <div className="cf-help">{t('settings.builtinModelsHint')}</div>
        {builtinCatalogLoading && !builtinCatalog ? (
          <div className="cf-help" style={{ marginTop: 8 }}>
            {t('settings.builtinCatalogLoading')}
          </div>
        ) : null}
        {!builtinCatalogLoading && (!builtinCatalog || builtinCatalog.models.length === 0) ? (
          <div className="cf-help" style={{ marginTop: 8 }}>
            {t('settings.builtinCatalogEmpty')}
          </div>
        ) : null}
        {builtinCatalog && builtinCatalog.models.length > 0 ? (
          <>
            {builtinCatalog.defaultModelId ? (
              <div className="cf-help" style={{ marginTop: 8 }}>
                {t('settings.builtinSuggestedDefault', { model: builtinCatalog.defaultModelId })}
              </div>
            ) : null}
            <div className="cf-settingsModels__modelList" style={{ marginTop: 10 }} role="list">
              {builtinCatalog.models.map((m) => {
                const isSug = Boolean(builtinCatalog.defaultModelId && m.id === builtinCatalog.defaultModelId);
                return (
                  <div key={m.id} className="cf-settingsModelRow" role="listitem">
                    <div className="cf-settingsModelRow__static">
                      <div className="cf-settingsModelRow__staticTitle" title={m.id}>
                        {m.id}
                      </div>
                      {m.label && m.label !== m.id ? <div className="cf-settingsModelRow__staticSub">{m.label}</div> : null}
                    </div>
                    <div className="cf-row" style={{ flexShrink: 0, gap: 8, alignItems: 'center' }}>
                      {!m.available ? (
                        <span className="cf-settingsBadge cf-settingsBadge--warn">{t('settings.modelMissingKeyShort')}</span>
                      ) : null}
                      {isSug ? <span className="cf-settingsBadge">{t('settings.builtinSuggestedBadge')}</span> : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        ) : null}
        <div className="cf-help" style={{ marginTop: 8 }}>
          {t('settings.builtinChatPickerHint')}
        </div>
      </div>
    </>
  ) as ReactNode;

  let detailPanels: ReactNode = null;
  if (activeSection === 'account') {
    detailPanels = (
      <>
        <div className="cf-card">
          <h3>{t('settings.workspaceNameLabel')}</h3>
          <div className="cf-divider" />
          <div className="cf-sub" style={{ marginBottom: 6 }}>
            {workspaceLoading ? t('dashboard.loading') : workspaceMeta?.name || t('settings.noWorkspaceSelected')}
          </div>
          <div className="cf-sub" style={{ marginBottom: 8 }}>
            <strong>{t('settings.dataCurrentWorkspace')}</strong>
          </div>
          <div className="cf-settingsModels__mono" style={{ wordBreak: 'break-all', marginBottom: 12 }}>
            {activeWorkspacePath || '—'}
          </div>
          <div className="cf-row" style={{ flexWrap: 'wrap', gap: 8 }}>
            <button className="cf-btn cf-btnGhost" type="button" onClick={() => void refreshWorkspace()}>
              {t('settings.refreshWorkspaceMeta')}
            </button>
            <button className="cf-btn" type="button" onClick={() => void pickWorkspaceFolder()}>
              {t('settings.pickWorkspaceFolder')}
            </button>
          </div>
        </div>
        <div className="cf-card">
          <h3>{t('settings.about')}</h3>
          <div className="cf-divider" />
          <div className="cf-row" style={{ gap: 24, flexWrap: 'wrap' }}>
            <div className="cf-sub">
              <strong style={{ color: 'var(--text)' }}>{t('settings.appVersion')}</strong>
              ：{appVersion || '—'}
            </div>
          </div>
        </div>
      </>
    );
  } else if (activeSection === 'system') {
    detailPanels = (
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
        </div>

        <div className="cf-card">
          <h3>{t('settings.execution')}</h3>
          <div className="cf-divider" />
          <div className="cf-help" style={{ marginBottom: 12 }}>
            {t('settings.chatEngineBuiltinOnlyHint')}
          </div>
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

        <div className="cf-card" id="settings-system-openclaw">
          <h3>{t('settings.openclaw')}</h3>
          <div className="cf-divider" />

          <div className="cf-row" style={{ alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <div>
              <div className="cf-sub" style={{ marginBottom: 4 }}>
                <strong style={{ color: 'var(--text)' }}>{t('settings.openclawCliVersionTitle')}</strong>
              </div>
              <div className="cf-sub">
                {cliAvailable === false ? t('settings.cliVersionNotInstalled') : t('settings.cliVersionChecking')}
              </div>
              <div className="cf-help" style={{ marginTop: 6 }}>
                {t('settings.openclawCliVersionHint')}
              </div>
            </div>
            <button type="button" className="cf-btn cf-btnSmall" onClick={() => void fetchStatus()}>
              {t('dashboard.refreshStatus')}
            </button>
          </div>

          <div className="cf-divider" />

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
            <span style={{ color: 'var(--muted)' }}>{t('common.viewGuide')}</span>
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
  } else if (activeSection === 'memory') {
    detailPanels = (
      <div className="cf-card">
        <div className="cf-help" style={{ marginBottom: 8 }}>
          {t('settings.memoryBullet1')}
        </div>
        <div className="cf-help" style={{ marginBottom: 8 }}>
          {t('settings.memoryBullet2')}
        </div>
        <div className="cf-help">{t('settings.memoryBullet3')}</div>
      </div>
    );
  } else if (activeSection === 'models') {
    detailPanels = (
      <div className="cf-card">
        <h3>{t('settings.modelsTitle')}</h3>
        <div className="cf-divider" />
        {panelModels}
      </div>
    );
  } else if (activeSection === 'integrations') {
    detailPanels = (
      <div className="cf-card">
        <h3>{t('settings.gatewayLabel')}</h3>
        <div className="cf-divider" />
        <div className="cf-settingsIntegrationRow">
          {gatewayChip}
          <button className="cf-btn cf-btnSmall" type="button" onClick={() => void fetchStatus()}>
            {t('dashboard.refreshStatus')}
          </button>
          <button
            className="cf-btn cf-btnSmall"
            type="button"
            disabled={isStarting}
            onClick={() => void handleStartGateway()}
          >
            {isStarting ? t('dashboard.starting') : t('dashboard.startGateway')}
          </button>
          <button
            className="cf-btn cf-btnSmall"
            type="button"
            disabled={isStopping || gatewayStatus !== 'running'}
            onClick={() => void handleStopGateway()}
          >
            {isStopping ? t('dashboard.stopping') : t('dashboard.stop')}
          </button>
          <button className="cf-btn cf-btnGhost cf-btnSmall" type="button" disabled={isStarting} onClick={() => void restartGateway()}>
            {t('settings.gatewayRestart')}
          </button>
        </div>
        {gatewayError ? <div className="cf-errorText" style={{ marginBottom: 8 }}>{gatewayError}</div> : null}
        <div className="cf-help" style={{ marginBottom: 8 }}>
          {t('settings.gatewayPort')}：{typeof gatewayPort === 'number' ? gatewayPort : '—'} · {t('settings.gatewayUptime')}：
          {gatewayStatus === 'running' ? `${Math.round((gatewayUptimeMs ?? 0) / 1000)}s` : '—'}
        </div>
        <div className="cf-help" style={{ marginBottom: 12 }}>
          {t('settings.connectorsCountHint', { count: connectorCount })}
        </div>
        <button className="cf-btn cf-btnGhost" style={{ marginRight: 8 }} type="button" onClick={() => void reloadConnectorsCount()}>
          {t('settings.refreshIntegrationStatus')}
        </button>
        <button className="cf-btn cf-btnGhost" type="button" onClick={() => void fetchLogs(120)}>
          {t('settings.gatewayViewLogs')}
        </button>
        {Array.isArray(gatewayLogs) && gatewayLogs.length ? (
          <pre className="cf-codeBlock" style={{ marginTop: 10, maxHeight: 220, overflow: 'auto' }}>
            {gatewayLogs
              .slice(-80)
              .map((l) => `[${new Date(l.ts).toLocaleTimeString()}] ${l.level}: ${l.msg}`)
              .join('\n')}
          </pre>
        ) : (
          <div className="cf-help" style={{ marginTop: 10 }}>
            {t('settings.gatewayLogsEmpty')}
          </div>
        )}
        <div style={{ height: 12 }} />
        <div className="cf-row" style={{ flexWrap: 'wrap', gap: 8 }}>
          <button className="cf-btn cf-btnPrimary" type="button" onClick={() => navigate('/connectors')}>
            {t('settings.openConnectors')}
          </button>
          <button className="cf-btn" type="button" onClick={() => navigate('/skills')}>
            {t('settings.openSkills')}
          </button>
        </div>
      </div>
    );
  } else if (activeSection === 'data') {
    detailPanels = (
      <div className="cf-card">
        <div className="cf-help" style={{ marginBottom: 8 }}>
          {t('settings.dataCurrentWorkspace')}：
          <span className="cf-settingsModels__mono" style={{ wordBreak: 'break-all', display: 'block', marginTop: 4 }}>
            {activeWorkspacePath || '—'}
          </span>
        </div>
        <div className="cf-help" style={{ marginBottom: 6 }}>
          {t('settings.dataWorkspaceBullet')}
        </div>
        <div className="cf-help">{t('settings.dataGlobalBullet')}</div>
      </div>
    );
  } else if (activeSection === 'help') {
    detailPanels = (
      <>
        <div className="cf-card">
          <h3>{t('settings.about')}</h3>
          <div className="cf-divider" />
          <div className="cf-row" style={{ gap: 24, flexWrap: 'wrap' }}>
            <div className="cf-sub">
              <strong style={{ color: 'var(--text)' }}>{t('settings.appVersion')}</strong>
              ：{appVersion || '—'}
            </div>
            <div className="cf-sub">{t('settings.license')}</div>
          </div>
          <div className="cf-help" style={{ marginTop: 10 }}>
            {t('common.viewGuide')}
          </div>
        </div>
        <div className="cf-card">
          <h3>{t('settings.feedbackComingSoonTitle')}</h3>
          <div className="cf-divider" />
          <div className="cf-help">{t('settings.feedbackComingSoonBody')}</div>
          <div style={{ height: 12 }} />
          <button
            type="button"
            className="cf-btn"
            onClick={() =>
              (window as any).__cf_toast?.success?.(
                t('settings.feedbackComingSoonTitle'),
                t('settings.feedbackComingSoonBody')
              )
            }
          >
            {t('settings.feedbackComingSoonTitle')}
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="cf-topbar">
        <div className="cf-pageTitle">
          <h2>{t('settings.title')}</h2>
          <p>{t('settings.subtitleSplit')}</p>
        </div>
        <div className="cf-row cf-settingsPage__actions">
          <button className="cf-btn cf-btnGhost" type="button" onClick={() => refreshSettingsData()}>
            {t('common.refresh')}
          </button>
          <button className="cf-btn cf-btnGhost" type="button" onClick={onReset}>
            {t('settings.reset')}
          </button>
          <button className="cf-btn cf-btnPrimary" type="button" onClick={() => void onSave()}>
            {t('settings.save')}
          </button>
        </div>
      </div>

      {cliAvailable === false ? (
        <div className="cf-banner">
          <div>
            <b>{t('settings.cliBannerMissingTitle')}</b>
            <span>{cliError || t('settings.cliPathMissingDetail')}</span>
          </div>
          <button className="cf-btn cf-btnGold" type="button" onClick={scrollToOpenClawPath}>
            {t('settings.goConfigureCliPath')}
          </button>
        </div>
      ) : null}

      <div className="cf-settingsPage__globalStripe" role="note">
        {t('settings.globalScopeStripe')}
      </div>

      <div className="cf-settingsSplit" role="presentation">
        <nav className="cf-settingsNav" aria-label={t('settings.title')}>
          {SETTINGS_SECTION_IDS.map((sid) => (
            <button
              key={sid}
              type="button"
              className={`cf-settingsNav__btn${activeSection === sid ? ' cf-settingsNav__btn--active' : ''}`}
              onClick={() => setActiveSection(sid)}
            >
              {t(NAV_LABEL_KEYS[sid])}
            </button>
          ))}
        </nav>
        <div className="cf-settingsDetail">
          <header className="cf-settingsDetail__head">
            <h2>{t(sectionHead.titleKey)}</h2>
            <p>{t(sectionHead.hintKey)}</p>
          </header>
          <div className="cf-settingsDetail__panels">{detailPanels}</div>
        </div>
      </div>
    </>
  );
};

export default SettingsPage;
