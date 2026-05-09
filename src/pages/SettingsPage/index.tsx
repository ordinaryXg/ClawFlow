import type { ReactNode } from 'react';
import { FC, useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import i18n from '../../i18n';
import './styles.css';
import { useGatewayStore } from '../../store/modules/gatewayStore';
import { useSettingsStore } from '../../store/modules/settingsStore';
import { useWorkspaceStore } from '../../store/modules/workspaceStore';
import { mergeConfiguredModelsForDisplay } from '../../utils/modelDisplay';

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
    version,
    fetchVersion,
    status: gatewayStatus,
    isStarting,
    isStopping,
    error: gatewayError,
    fetchStatus,
    startGateway,
    stopGateway,
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
  const [modelProvider, setModelProvider] = useState<'deepseek' | 'openai'>('deepseek');
  const [modelProfileLabel, setModelProfileLabel] = useState('');
  const [modelToken, setModelToken] = useState('');
  const [defaultModelId, setDefaultModelId] = useState('deepseek/deepseek-chat');
  const [modelSaving, setModelSaving] = useState(false);
  const [configuredModels, setConfiguredModels] = useState<Array<{ id: string; available?: boolean; tags?: string[] }>>([]);
  const [configuredProviders, setConfiguredProviders] = useState<string[]>([]);
  const [providerProfiles, setProviderProfiles] = useState<Record<string, { profileId: string; label?: string }>>({});
  const [cliAvailable, setCliAvailable] = useState<boolean | null>(null);
  const [cliError, setCliError] = useState<string>('');

  useEffect(() => {
    setCliPath(storeCliPath);
    setTimeoutMs(storeTimeout);
  }, [storeCliPath, storeTimeout]);

  useEffect(() => {
    void fetchVersion();
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
  }, [fetchVersion, t]);

  const reloadModelsFromEngine = useCallback(async () => {
    try {
      const res = await window.electronAPI?.getModels?.();
      const def = typeof res?.defaultModelId === 'string' ? res.defaultModelId : '';
      if (def) setDefaultModelId(def);
      const list = Array.isArray(res?.models) ? res.models : [];
      setConfiguredModels(
        list
          .map((m: any) => {
            const id = String(m?.id ?? m?.key ?? '').trim();
            if (!id) return null;
            return { id, available: m?.available, tags: Array.isArray(m?.tags) ? m.tags : undefined };
          })
          .filter(Boolean) as Array<{ id: string; available?: boolean; tags?: string[] }>
      );
      setConfiguredProviders(Array.isArray(res?.configuredProviders) ? res.configuredProviders : []);
      setProviderProfiles(res?.providerProfiles && typeof res.providerProfiles === 'object' ? res.providerProfiles : {});
    } catch {
      setConfiguredModels([]);
      setConfiguredProviders([]);
      setProviderProfiles({});
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
    void reloadModelsFromEngine();
  }, [activeWorkspacePath, reloadModelsFromEngine]);

  useEffect(() => {
    if (activeSection !== 'integrations') return;
    void fetchStatus();
    void reloadConnectorsCount();
  }, [activeSection, fetchStatus, reloadConnectorsCount]);

  useEffect(() => {
    if (activeSection !== 'account') return;
    void refreshWorkspace();
  }, [activeSection, refreshWorkspace]);

  const displayModels = useMemo(
    () =>
      mergeConfiguredModelsForDisplay(
        configuredModels,
        configuredProviders,
        Object.keys(providerProfiles ?? {})
      ),
    [configuredModels, configuredProviders, providerProfiles]
  );

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

  const refreshSettingsData = () => {
    void fetchVersion();
    void reloadModelsFromEngine();
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
      try {
        const res = await window.electronAPI?.getModels?.();
        const list = Array.isArray(res?.models) ? res.models : [];
        setConfiguredModels(
          list
            .map((m: any) => {
              const id = String(m?.id ?? m?.key ?? '').trim();
              if (!id) return null;
              return { id, available: m?.available, tags: Array.isArray(m?.tags) ? m.tags : undefined };
            })
            .filter(Boolean) as Array<{ id: string; available?: boolean; tags?: string[] }>
        );
        const fromServer = Array.isArray(res?.configuredProviders) ? res.configuredProviders : [];
        setConfiguredProviders(Array.from(new Set([provider, ...fromServer.map((x) => String(x).trim()).filter(Boolean)])));
        const baseProf =
          res?.providerProfiles && typeof res.providerProfiles === 'object' ? { ...res.providerProfiles } : {};
        const prevEntry =
          baseProf[provider] && typeof baseProf[provider] === 'object' ? baseProf[provider] : {};
        baseProf[provider] = {
          ...prevEntry,
          profileId: `${provider}:manual`,
          ...(label ? { label } : {}),
        };
        setProviderProfiles(baseProf);
      } catch {
        setConfiguredProviders((prev) => Array.from(new Set([provider, ...prev])));
        setProviderProfiles((prev) => ({
          ...prev,
          [provider]: { ...prev[provider], profileId: `${provider}:manual`, ...(label ? { label } : {}) },
        }));
      }
      (window as any).__cf_toast?.success?.(t('settings.modelSavedTitle'), t('settings.modelSavedBody'));
    } catch (e: any) {
      (window as any).__cf_toast?.error?.(t('settings.modelSaveFailTitle'), e?.message || t('common.sampleOpFailBody'));
    } finally {
      setModelSaving(false);
    }
  };

  const onSetDefaultModel = async (modelId: string) => {
    const id = String(modelId ?? '').trim();
    if (!id) return;
    setModelSaving(true);
    try {
      await window.electronAPI?.setDefaultModel?.({ modelId: id });
      setDefaultModelId(id);
      (window as any).__cf_toast?.success?.(t('settings.defaultModelSetTitle'), t('settings.defaultModelSetBody'));
    } catch (e: any) {
      (window as any).__cf_toast?.error?.(t('settings.defaultModelSetFailTitle'), e?.message || t('common.sampleOpFailBody'));
    } finally {
      setModelSaving(false);
    }
  };

  const onRemoveStaleModelRow = async (modelId: string, provider: string) => {
    const id = String(modelId ?? '').trim();
    const p = String(provider ?? '').trim();
    if (!id || !p) return;
    const hasLocalToken = Boolean(providerProfiles?.[p]);
    const flaggedByCli = configuredProviders.includes(p);
    const providerConfigured = hasLocalToken || flaggedByCli;

    const confirmed = providerConfigured
      ? window.confirm(t('settings.modelDeleteConfirm'))
      : window.confirm(t('settings.modelRemoveStaleConfirm'));
    if (!confirmed) return;

    setModelSaving(true);
    try {
      let cliRemoved = false;
      try {
        const pid = providerProfiles[p]?.profileId;
        const rm = await window.electronAPI?.removeListedModel?.({
          modelId: id,
          ...(pid ? { profileId: pid } : {}),
        });
        cliRemoved = Boolean(rm?.cliRemoved);
      } catch (inner: any) {
        const raw = String(inner?.message ?? inner ?? '');
        if (raw.includes('MODEL_REMOVE_BLOCKED_ONLY_LISTED_MODEL')) {
          (window as any).__cf_toast?.error?.(t('settings.modelRemoveBlockedOnlyTitle'), t('settings.modelRemoveBlockedOnlyBody'));
          return;
        }
        throw inner;
      }

      await reloadModelsFromEngine();

      if (providerConfigured) {
        (window as any).__cf_toast?.success?.(
          t('settings.modelDeletedTitle'),
          cliRemoved ? t('settings.modelDeletedBody') : t('settings.modelRowRemovedPartialBody')
        );
      } else if (cliRemoved) {
        (window as any).__cf_toast?.success?.(t('settings.modelRowRemovedTitle'), t('settings.modelRowRemovedBody'));
      } else {
        (window as any).__cf_toast?.success?.(t('settings.modelRowRemovedTitle'), t('settings.modelRowRemovedPartialBody'));
      }
    } catch (e: any) {
      (window as any).__cf_toast?.error?.(t('settings.modelDeleteFailTitle'), e?.message || t('common.sampleOpFailBody'));
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

      <div className="cf-settingsModels">
        <div className="cf-settingsModels__col">
          <div className="cf-settingsModels__sectionTitle">{t('settings.configuredModels')}</div>
          <div className="cf-help">
            {t('settings.currentModel')}: {defaultModelId || t('common.unknown')}
          </div>

          {displayModels.length === 0 ? (
            <div className="cf-help">{t('settings.noConfiguredModels')}</div>
          ) : (
            <div className="cf-settingsModels__modelList" role="list">
              {displayModels.map((m) => {
                const isDefault = Boolean(defaultModelId && m.id === defaultModelId);
                const provider = String(m.id).split('/')[0] || '';
                const providerConfigured = Boolean(providerProfiles?.[provider]) || configuredProviders.includes(provider);
                const providerLabel = providerProfiles?.[provider]?.label;
                return (
                  <div
                    key={m.id}
                    className={isDefault ? 'cf-settingsModelRow cf-settingsModelRow--active' : 'cf-settingsModelRow'}
                    role="listitem"
                  >
                    <button
                      type="button"
                      className="cf-settingsModelRow__pick"
                      disabled={modelSaving}
                      onClick={() => void onSetDefaultModel(m.id)}
                      title={t('settings.pickDefault')}
                    >
                      <span className="cf-settingsModelRow__id">
                        {m.id}
                        {providerLabel ? <span className="cf-settingsModelRow__label"> · {providerLabel}</span> : null}
                      </span>
                      {m.available === false ? (
                        <span className="cf-settingsBadge cf-settingsBadge--warn">{t('settings.modelUnavailable')}</span>
                      ) : null}
                      {isDefault ? <span className="cf-settingsBadge">{t('settings.modelDefaultBadge')}</span> : null}
                    </button>

                    <div className="cf-row" style={{ flexShrink: 0, gap: 8, alignItems: 'center' }}>
                      {!providerConfigured ? (
                        <span className="cf-sub" title={t('settings.modelMissingKeyTitle', { provider })}>
                          {t('settings.modelMissingKeyShort')}
                        </span>
                      ) : null}
                      <button
                        type="button"
                        className="cf-btn cf-btnGhost cf-btnSmall"
                        disabled={modelSaving}
                        onClick={() => void onRemoveStaleModelRow(m.id, provider)}
                        title={
                          providerConfigured
                            ? t('settings.modelDeleteProviderTitle', { provider })
                            : t('settings.modelRemoveStaleHint', { model: m.id })
                        }
                      >
                        {t('common.delete')}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="cf-settingsModels__col">
          <div className="cf-settingsModels__sectionTitle">{t('settings.addProviderTitle')}</div>
          <div className="cf-help">{t('settings.addProviderHint')}</div>
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
          <select className="cf-select" value={modelProvider} onChange={(e) => setModelProvider(e.target.value as 'deepseek' | 'openai')}>
            <option value="deepseek">DeepSeek</option>
            <option value="openai">OpenAI</option>
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
                {cliAvailable === false ? t('settings.cliVersionNotInstalled') : version || t('settings.cliVersionChecking')}
              </div>
              <div className="cf-help" style={{ marginTop: 6 }}>
                {t('settings.openclawCliVersionHint')}
              </div>
            </div>
            <button type="button" className="cf-btn cf-btnSmall" onClick={() => void fetchVersion()}>
              {t('settings.recheckCliVersion')}
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
          <button className="cf-btn cf-btnSmall" type="button" disabled={cliAvailable === false} onClick={() => void fetchStatus()}>
            {t('dashboard.refreshStatus')}
          </button>
          <button
            className="cf-btn cf-btnSmall"
            type="button"
            disabled={cliAvailable === false || isStarting}
            onClick={() => void handleStartGateway()}
          >
            {isStarting ? t('dashboard.starting') : t('dashboard.startGateway')}
          </button>
          <button
            className="cf-btn cf-btnSmall"
            type="button"
            disabled={cliAvailable === false || isStopping || gatewayStatus !== 'running'}
            onClick={() => void handleStopGateway()}
          >
            {isStopping ? t('dashboard.stopping') : t('dashboard.stop')}
          </button>
        </div>
        {gatewayError ? <div className="cf-errorText" style={{ marginBottom: 8 }}>{gatewayError}</div> : null}
        {cliAvailable === false ? <div className="cf-help" style={{ marginBottom: 8 }}>{t('settings.integrationsCliRequired')}</div> : null}
        <div className="cf-help" style={{ marginBottom: 12 }}>
          {t('settings.connectorsCountHint', { count: connectorCount })}
        </div>
        <button className="cf-btn cf-btnGhost" style={{ marginRight: 8 }} type="button" onClick={() => void reloadConnectorsCount()}>
          {t('settings.refreshIntegrationStatus')}
        </button>
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
