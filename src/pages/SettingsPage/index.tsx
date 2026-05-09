import { FC, useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import i18n from '../../i18n';
import './styles.css';
import { useConnectorStore } from '../../store/modules/connectorStore';
import { useGatewayStore } from '../../store/modules/gatewayStore';
import { useSettingsStore } from '../../store/modules/settingsStore';
import { useSkillStore } from '../../store/modules/skillStore';
import { useWorkspaceStore } from '../../store/modules/workspaceStore';
import { mergeConfiguredModelsForDisplay } from '../../utils/modelDisplay';

const SettingsPage: FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const {
    version,
    status: gatewayStatus,
    isStarting,
    isStopping,
    error: gatewayError,
    fetchStatus,
    fetchVersion,
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

  const { skills, fetchSkills, error: skillError, isLoading: isSkillLoading } = useSkillStore();
  const {
    connectors,
    fetchConnectors,
    error: connectorError,
    isLoading: isConnectorLoading,
  } = useConnectorStore();

  const installedSkillsCount = useMemo(
    () => skills.filter((s) => s.installed).length,
    [skills]
  );
  const enabledSkillsCount = useMemo(() => skills.filter((s) => s.enabled).length, [skills]);
  const connectorsCount = connectors.length;

  const gatewayChip = useMemo(() => {
    if (gatewayStatus === 'running')
      return <span className="cf-chip cf-chipRunning">{t('gateway.statusRunning')}</span>;
    if (gatewayStatus === 'stopped')
      return <span className="cf-chip cf-chipStopped">{t('gateway.statusStopped')}</span>;
    return <span className="cf-chip cf-chipUnknown">{t('gateway.statusUnknown')}</span>;
  }, [gatewayStatus, t]);

  const canOperateGateway = cliAvailable !== false;

  useEffect(() => {
    setCliPath(storeCliPath);
    setTimeoutMs(storeTimeout);
  }, [storeCliPath, storeTimeout]);

  useEffect(() => {
    void fetchVersion();
    void fetchStatus();
    void fetchSkills();
    void fetchConnectors();
    if (window.electronAPI?.validateCLI) {
      window.electronAPI
        .validateCLI()
        .then((available: boolean) => {
          setCliAvailable(available);
          setCliError(available ? '' : t('dashboard.cliNotInPath'));
        })
        .catch(() => {
          setCliAvailable(false);
          setCliError(t('dashboard.cliCheckFailed'));
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
  }, [fetchConnectors, fetchSkills, fetchStatus, fetchVersion, t]);

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
    })();
    // 切换工作区后刷新：主进程模型数据为全局，但避免界面长期缓存旧快照
  }, [activeWorkspacePath]);

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

  const handleStartGateway = async () => {
    if (!canOperateGateway) return;
    try {
      await startGateway();
      await fetchStatus();
      (window as any).__cf_toast?.success?.(t('common.sampleTitle'), t('gateway.startOkBody'));
    } catch (e: any) {
      (window as any).__cf_toast?.error?.(t('gateway.startFailTitle'), e?.message || t('common.sampleOpFailBody'));
    }
  };

  const handleStopGateway = async () => {
    if (!canOperateGateway) return;
    await stopGateway();
    await fetchStatus();
  };

  const refreshStatusOverview = () => {
    void fetchVersion();
    void fetchStatus();
    void fetchSkills();
    void fetchConnectors();
    if (window.electronAPI?.validateCLI) {
      window.electronAPI
        .validateCLI()
        .then((available: boolean) => {
          setCliAvailable(available);
          setCliError(available ? '' : t('dashboard.cliNotInPath'));
        })
        .catch(() => {
          setCliAvailable(false);
          setCliError(t('dashboard.cliCheckFailed'));
        });
    }
    (window as any).__cf_toast?.success?.(t('common.toastRefreshOkTitle'), t('common.toastRefreshOkBody'));
  };

  const scrollToOpenClawPath = () => {
    document.getElementById('settings-openclaw-path')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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

  const onDeleteProviderToken = async (provider: string) => {
    const p = String(provider ?? '').trim();
    if (!p) return;
    const ok = window.confirm(t('settings.modelDeleteConfirm'));
    if (!ok) return;
    setModelSaving(true);
    try {
      await window.electronAPI?.removeModelAuthToken?.({ provider: p, profileId: `${p}:manual` });
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
      (window as any).__cf_toast?.success?.(t('settings.modelDeletedTitle'), t('settings.modelDeletedBody'));
    } catch (e: any) {
      (window as any).__cf_toast?.error?.(t('settings.modelDeleteFailTitle'), e?.message || t('common.sampleOpFailBody'));
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
          <button className="cf-btn cf-btnGhost" type="button" onClick={() => refreshStatusOverview()}>
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
            <b>{t('dashboard.noOpenClaw')}</b>
            <span>{cliError || t('dashboard.cliNotInPath')}</span>
          </div>
          <button className="cf-btn cf-btnGold" type="button" onClick={scrollToOpenClawPath}>
            {t('dashboard.goSetPath')}
          </button>
        </div>
      ) : null}

      {(gatewayError || skillError || connectorError) && cliAvailable !== false ? (
        <div
          className="cf-banner"
          style={{
            marginTop: 12,
            borderColor: 'rgba(194,75,75,.45)',
            background: 'rgba(194,75,75,.10)',
          }}
        >
          <div>
            <b>{t('dashboard.partialLoadFailed')}</b>
            <span>
              {gatewayError ? `${t('dashboard.errGateway')}${gatewayError} ` : ''}
              {skillError ? `${t('dashboard.errSkills')}${skillError} ` : ''}
              {connectorError ? `${t('dashboard.errConnectors')}${connectorError}` : ''}
            </span>
          </div>
          <button
            type="button"
            className="cf-btn cf-btnDanger"
            onClick={() =>
              (window as any).__cf_toast?.error?.(t('dashboard.suggestTitle'), t('dashboard.suggestBody'))
            }
          >
            {t('dashboard.suggestTitle')}
          </button>
        </div>
      ) : null}

      <div className="cf-settingsPage__globalStripe" role="note">
        {t('settings.globalScopeStripe')}
      </div>

      <section className="cf-grid cf-settingsPage__grid">
        <div className="cf-card cf-col12">
          <h3>{t('settings.statusOverviewTitle')}</h3>
          <div className="cf-help">{t('settings.statusOverviewHint')}</div>
          <div className="cf-divider" />

          <div className="cf-grid">
            <div className="cf-card cf-col4" style={{ background: 'var(--panel2, rgba(255,255,255,.02))' }}>
              <h3>{t('dashboard.openclawVersion')}</h3>
              <div className="cf-row" style={{ alignItems: 'center', justifyContent: 'space-between' }}>
                <span className="cf-sub">
                  {cliAvailable === false ? t('dashboard.notInstalled') : version || t('dashboard.checking')}
                </span>
                <button type="button" className="cf-btn cf-btnSmall" onClick={() => void fetchVersion()}>
                  {t('dashboard.recheck')}
                </button>
              </div>
              <div className="cf-divider" />
              <div className="cf-sub">{t('dashboard.missingHint')}</div>
            </div>

            <div className="cf-card cf-col8" style={{ background: 'var(--panel2, rgba(255,255,255,.02))' }}>
              <h3>{t('dashboard.gatewayStatus')}</h3>
              <div className="cf-row" style={{ alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                <div className="cf-row" style={{ alignItems: 'center', gap: 10 }}>
                  {gatewayChip}
                  <span className="cf-sub">
                    {isStarting
                      ? t('dashboard.starting')
                      : isStopping
                        ? t('dashboard.stopping')
                        : t('dashboard.statusSource')}
                  </span>
                </div>
                <div className="cf-row" style={{ flexWrap: 'wrap', gap: 8 }}>
                  <button type="button" className="cf-btn" onClick={() => void fetchStatus()}>
                    {t('dashboard.refreshStatus')}
                  </button>
                  <button
                    type="button"
                    className="cf-btn cf-btnPrimary"
                    disabled={!canOperateGateway || gatewayStatus === 'running' || isStopping || isStarting}
                    onClick={() => void handleStartGateway()}
                  >
                    {t('dashboard.startGateway')}
                  </button>
                  <button
                    type="button"
                    className="cf-btn cf-btnDanger"
                    disabled={!canOperateGateway || gatewayStatus === 'stopped' || isStopping || isStarting}
                    onClick={() => void handleStopGateway()}
                  >
                    {t('dashboard.stop')}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="cf-divider" />

          <div className="cf-grid">
            <div className="cf-card cf-col4" style={{ background: 'var(--panel2, rgba(255,255,255,.02))' }}>
              <h3>{t('dashboard.overview')}</h3>
              <div className="cf-sub">
                {t('dashboard.skillsCount')}：{installedSkillsCount} / {enabledSkillsCount}
                {isSkillLoading ? ` · ${t('dashboard.loading')}` : ''}
              </div>
              <div className="cf-sub">
                {t('dashboard.connectorsCount')}：{connectorsCount}
                {isConnectorLoading ? ` · ${t('dashboard.loading')}` : ''}
              </div>
            </div>
            <div className="cf-card cf-col8" style={{ background: 'var(--panel2, rgba(255,255,255,.02))' }}>
              <h3>{t('dashboard.quickLinks')}</h3>
              <div className="cf-row" style={{ flexWrap: 'wrap', gap: 8 }}>
                <button type="button" className="cf-btn cf-btnPrimary" onClick={() => navigate('/chat')}>
                  {t('dashboard.enterChat')}
                </button>
                <button type="button" className="cf-btn" onClick={() => navigate('/skills')}>
                  {t('dashboard.manageSkills')}
                </button>
                <button type="button" className="cf-btn" onClick={() => navigate('/connectors')}>
                  {t('dashboard.manageConnectors')}
                </button>
              </div>
              <div className="cf-help">{t('dashboard.goalHint')}</div>
            </div>
          </div>
        </div>

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

        <div className="cf-card cf-col6" id="settings-openclaw-path">
          <h3>{t('settings.openclaw')}</h3>
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
          <h3>{t('settings.modelsTitle')}</h3>
          <div className="cf-divider" />
          <div className="cf-help">{t('settings.modelsHint')}</div>
          <div className="cf-help" style={{ marginTop: 6 }}>
            {t('settings.modelsLocalHint')}
          </div>

          <div className="cf-settingsModels">
            {/* Left: configured models + default selection */}
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

                        {providerConfigured ? (
                          <button
                            type="button"
                            className="cf-btn cf-btnGhost cf-btnSmall"
                            disabled={modelSaving}
                            onClick={() => void onDeleteProviderToken(provider)}
                            title={t('settings.modelDeleteProviderTitle', { provider })}
                          >
                            {t('common.delete')}
                          </button>
                        ) : (
                          <span className="cf-sub" title={t('settings.modelMissingKeyTitle', { provider })}>
                            {t('settings.modelMissingKeyShort')}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Right: add/configure provider */}
            <div className="cf-settingsModels__col">
              <div className="cf-settingsModels__sectionTitle">{t('settings.addProviderTitle')}</div>
              <div className="cf-help">{t('settings.addProviderHint')}</div>
              <div style={{ height: 10 }} />

              <div className="cf-sub" style={{ marginBottom: 6 }}>{t('settings.modelProfileName')}</div>
              <input
                className="cf-input"
                value={modelProfileLabel}
                onChange={(e) => setModelProfileLabel(e.target.value)}
                placeholder={t('settings.modelProfileNamePh')}
              />
              <div className="cf-help">{t('settings.modelProfileNameHint')}</div>
              <div style={{ height: 10 }} />

              <div className="cf-sub" style={{ marginBottom: 6 }}>{t('settings.modelProvider')}</div>
              <select className="cf-select" value={modelProvider} onChange={(e) => setModelProvider(e.target.value as any)}>
                <option value="deepseek">DeepSeek</option>
                <option value="openai">OpenAI</option>
              </select>

              <div style={{ height: 10 }} />
              <div className="cf-sub" style={{ marginBottom: 6 }}>{t('settings.modelToken')}</div>
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
      </section>
    </>
  );
};

export default SettingsPage;
