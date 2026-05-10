import type { ReactNode } from 'react';
import { FC, useCallback, useEffect, useMemo, useState } from 'react';
import { Checkbox } from 'antd';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import i18n from '../../i18n';
import './styles.css';
import { useGatewayStore } from '../../store/modules/gatewayStore';
import { useSettingsStore } from '../../store/modules/settingsStore';
import { useWorkspaceStore } from '../../store/modules/workspaceStore';
import { useChatStore } from '../../store/modules/chatStore';
import { CfSelectWithHints } from '../../components/CfSelectWithHints';
import WorkspaceNewToolsModal from '../../components/workspace/WorkspaceNewToolsModal';
import {
  DEFAULT_WORKSPACE_TOOL_SELECTION,
  WORKSPACE_TOOL_IDS,
  type WorkspaceToolId,
  type WorkspaceToolSelection,
} from '../../shared/workspace-tools';
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
    updateSettings,
    resetSettings,
  } = useSettingsStore();

  const activeWorkspacePath = useWorkspaceStore((s) => s.activePath);
  const workspaceMeta = useWorkspaceStore((s) => s.meta);
  const workspaceLoading = useWorkspaceStore((s) => s.loading);
  const refreshWorkspace = useWorkspaceStore((s) => s.refresh);
  const pickWorkspacePath = useWorkspaceStore((s) => s.pickWorkspacePath);
  const commitNewWorkspace = useWorkspaceStore((s) => s.commitNewWorkspace);
  const fetchConversations = useChatStore((s) => s.fetchConversations);

  const [activeSection, setActiveSection] = useState<SettingsSectionId>('account');
  const [toolModal, setToolModal] = useState<{
    open: boolean;
    path: string | null;
    mode: 'create';
  }>({ open: false, path: null, mode: 'create' });
  const [accountToolsSel, setAccountToolsSel] = useState<Record<WorkspaceToolId, boolean>>({
    ...DEFAULT_WORKSPACE_TOOL_SELECTION,
  });
  const [accountToolsSaving, setAccountToolsSaving] = useState(false);
  const [connectorCount, setConnectorCount] = useState(0);

  const [appVersion, setAppVersion] = useState<string>('');
  const [modelProvider, setModelProvider] = useState<'deepseek' | 'openai' | 'anthropic'>('deepseek');
  const [modelEnvironment, setModelEnvironment] = useState<'personal' | 'work' | 'custom'>('personal');
  const [modelProfileLabel, setModelProfileLabel] = useState('');
  const [modelToken, setModelToken] = useState('');
  const [modelSaving, setModelSaving] = useState(false);
  const [authSummary, setAuthSummary] = useState<null | {
    profiles: Array<{
      provider: string;
      profileId: string;
      label?: string;
      environment?: 'personal' | 'work' | 'custom';
      encryption: 'electron.safeStorage';
      createdAt: number;
      updatedAt: number;
    }>;
    activeProfileIdByProvider: Record<string, string>;
  }>(null);
  const [authTesting, setAuthTesting] = useState<Record<string, boolean>>({});
  const [renaming, setRenaming] = useState<{ provider: string; profileId: string; label: string } | null>(null);
  const [policyDraft, setPolicyDraft] = useState('');
  const [builtinCatalog, setBuiltinCatalog] = useState<{
    defaultModelId: string | null;
    models: Array<{ id: string; label: string; available: boolean }>;
  } | null>(null);
  const [builtinCatalogLoading, setBuiltinCatalogLoading] = useState(false);

  useEffect(() => {
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
        // OpenClaw CLI settings removed (chat & gateway run fully built-in).
      } catch {
        /* ignore */
      }
    })();
  }, []);

  const onSave = async () => {
    updateSettings({
      theme,
      language,
      autoStartGateway,
      logLevel,
    });
    try {
      (window as any).__cf_toast?.success?.(t('settings.savedTitle'), t('settings.savedBody'));
    } catch {
      (window as any).__cf_toast?.error?.(t('settings.savePartialTitle'), t('settings.savePartialBody'));
    }
  };

  const onReset = () => {
    if (!window.confirm(t('settings.resetConfirm'))) return;
    resetSettings();
    const st = useSettingsStore.getState();
    void i18n.changeLanguage(st.language);
    document.documentElement.dataset.theme = st.theme;
    (window as any).__cf_toast?.success?.(t('settings.resetOkTitle'), t('settings.resetOkBody'));
  };

  useEffect(() => {
    const p = activeWorkspacePath?.trim();
    if (!p) {
      setAccountToolsSel({ ...DEFAULT_WORKSPACE_TOOL_SELECTION });
      return;
    }
    void (async () => {
      const res = await window.electronAPI?.workspaceGetToolSelection?.(p);
      if (res?.ok === true && res.tools) {
        setAccountToolsSel({ ...DEFAULT_WORKSPACE_TOOL_SELECTION, ...res.tools });
      } else {
        setAccountToolsSel({ ...DEFAULT_WORKSPACE_TOOL_SELECTION });
      }
    })();
  }, [activeWorkspacePath]);

  const refreshSettingsData = () => {
    void reloadBuiltinCatalog();
    void fetchStatus();
    void reloadConnectorsCount();
    (window as any).__cf_toast?.success?.(t('common.toastRefreshOkTitle'), t('common.toastRefreshOkBody'));
  };

  const onPickWorkspaceFolder = async () => {
    const picked = await pickWorkspacePath();
    if (!picked) return;
    setToolModal({ open: true, path: picked, mode: 'create' });
  };

  const onConfirmWorkspaceTools = async (tools: WorkspaceToolSelection) => {
    const p = toolModal.path;
    setToolModal({ open: false, path: null, mode: 'create' });
    if (!p) return;
    await commitNewWorkspace(p, tools);
    await fetchConversations();
    (window as any).__cf_toast?.success?.(t('settings.workspacePickOkTitle'), t('settings.workspacePickOkBody'));
  };

  const onSaveAccountWorkspaceTools = async () => {
    const p = activeWorkspacePath?.trim();
    if (!p) return;
    setAccountToolsSaving(true);
    try {
      const res = await window.electronAPI?.workspaceSetToolSelection?.(p, accountToolsSel);
      if (res?.ok) {
        (window as any).__cf_toast?.success?.(t('workspace.toolsSavedTitle'), t('workspace.toolsSavedBody'));
      } else {
        (window as any).__cf_toast?.error?.(
          t('workspace.toolsSaveFailed'),
          res && 'error' in res ? res.error : undefined
        );
      }
    } finally {
      setAccountToolsSaving(false);
    }
  };

  // OpenClaw CLI settings removed (desktop runs fully built-in).

  const gatewayChip = useMemo(() => {
    if (gatewayStatus === 'running')
      return <span className="cf-chip cf-chipRunning">{t('gateway.statusRunning')}</span>;
    if (gatewayStatus === 'stopped')
      return <span className="cf-chip cf-chipStopped">{t('gateway.statusStopped')}</span>;
    return <span className="cf-chip cf-chipUnknown">{t('gateway.statusUnknown')}</span>;
  }, [gatewayStatus, t]);

  const modelEnvSelectOptions = useMemo(
    () => [
      { value: 'personal', label: t('settings.modelEnv_personal'), hint: t('settings.modelEnvHint_personal') },
      { value: 'work', label: t('settings.modelEnv_work'), hint: t('settings.modelEnvHint_work') },
      { value: 'custom', label: t('settings.modelEnv_custom'), hint: t('settings.modelEnvHint_custom') },
    ],
    [t],
  );

  const modelProviderSelectOptions = useMemo(
    () => [
      { value: 'deepseek', label: 'DeepSeek', hint: t('settings.providerHintDeepseek') },
      { value: 'openai', label: 'OpenAI', hint: t('settings.providerHintOpenai') },
      { value: 'anthropic', label: 'Anthropic', hint: t('settings.providerHintAnthropic') },
    ],
    [t],
  );

  const logLevelSelectOptions = useMemo(
    () => [
      { value: 'debug', label: 'debug', hint: t('settings.logLevelHint_debug') },
      { value: 'info', label: 'info', hint: t('settings.logLevelHint_info') },
      { value: 'warn', label: 'warn', hint: t('settings.logLevelHint_warn') },
      { value: 'error', label: 'error', hint: t('settings.logLevelHint_error') },
    ],
    [t],
  );

  const handleStartGateway = async () => {
    try {
      await startGateway();
      await fetchStatus();
      (window as any).__cf_toast?.success?.(t('common.sampleTitle'), t('gateway.startOkBody'));
    } catch (e: any) {
      (window as any).__cf_toast?.error?.(t('gateway.startFailTitle'), e?.message || t('common.sampleOpFailBody'));
    }
  };

  const handleStopGateway = async () => {
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
      // Create a dedicated profile (multi-account). New profile becomes active by default.
      await window.electronAPI?.engineAuthUpsertProfile?.({
        provider,
        token,
        ...(label ? { label } : {}),
        environment: modelEnvironment,
      });
      setModelToken('');
      setModelProfileLabel('');
      void reloadBuiltinCatalog();
      void reloadAuthSummary();
      (window as any).__cf_toast?.success?.(t('settings.modelSavedTitle'), t('settings.modelSavedBody'));
    } catch (e: any) {
      (window as any).__cf_toast?.error?.(t('settings.modelSaveFailTitle'), e?.message || t('common.sampleOpFailBody'));
    } finally {
      setModelSaving(false);
    }
  };

  const reloadAuthSummary = useCallback(async () => {
    try {
      const res = await window.electronAPI?.engineAuthListProfiles?.();
      if (!res || typeof res !== 'object') return;
      setAuthSummary({
        profiles: Array.isArray((res as any).profiles) ? ((res as any).profiles as any[]) : [],
        activeProfileIdByProvider:
          (res as any).activeProfileIdByProvider && typeof (res as any).activeProfileIdByProvider === 'object'
            ? ((res as any).activeProfileIdByProvider as Record<string, string>)
            : {},
      });
    } catch {
      setAuthSummary(null);
    }
  }, []);

  useEffect(() => {
    void reloadAuthSummary();
  }, [reloadAuthSummary]);

  useEffect(() => {
    const raw = useSettingsStore.getState().chatModePolicyOverridesJson ?? '';
    setPolicyDraft(raw);
  }, []);

  const onSetActiveProfile = async (provider: string, profileId: string) => {
    try {
      await window.electronAPI?.engineAuthSetActiveProfile?.({ provider, profileId });
      void reloadBuiltinCatalog();
      void reloadAuthSummary();
      (window as any).__cf_toast?.success?.(t('common.sampleTitle'), t('settings.modelProfileSetActiveOk'));
    } catch (e: any) {
      (window as any).__cf_toast?.error?.(t('common.sampleDetectFailTitle'), e?.message || t('common.sampleOpFailBody'));
    }
  };

  const onRemoveProfile = async (provider: string, profileId: string) => {
    try {
      await window.electronAPI?.engineAuthRemoveProfile?.({ provider, profileId });
      void reloadBuiltinCatalog();
      void reloadAuthSummary();
      (window as any).__cf_toast?.success?.(t('common.sampleTitle'), t('settings.modelProfileRemovedOk'));
    } catch (e: any) {
      (window as any).__cf_toast?.error?.(t('common.sampleDetectFailTitle'), e?.message || t('common.sampleOpFailBody'));
    }
  };

  const onTestProfile = async (provider: 'deepseek' | 'openai' | 'anthropic', profileId: string) => {
    const key = `${provider}::${profileId}`;
    setAuthTesting((s) => ({ ...s, [key]: true }));
    try {
      const res = await window.electronAPI?.engineAuthTestConnection?.({ provider, profileId });
      if (res?.ok) {
        (window as any).__cf_toast?.success?.(t('settings.modelTestOkTitle'), t('settings.modelTestOkBody', { ms: res.latencyMs }));
      } else {
        const code = String(res?.errorCode ?? 'unknown');
        (window as any).__cf_toast?.error?.(t('settings.modelTestFailTitle'), t(`settings.modelTestFail_${code}`, res as any) || (res?.message || t('common.sampleOpFailBody')));
      }
    } catch (e: any) {
      (window as any).__cf_toast?.error?.(t('settings.modelTestFailTitle'), e?.message || t('common.sampleOpFailBody'));
    } finally {
      setAuthTesting((s) => {
        const n = { ...s };
        delete n[key];
        return n;
      });
    }
  };

  const beginRenameProfile = (provider: string, profileId: string, currentLabel?: string) => {
    setRenaming({ provider, profileId, label: String(currentLabel ?? '').trim() });
  };

  const cancelRenameProfile = () => setRenaming(null);

  const commitRenameProfile = async () => {
    if (!renaming) return;
    const provider = renaming.provider;
    const profileId = renaming.profileId;
    const label = String(renaming.label ?? '').trim();
    try {
      await window.electronAPI?.engineAuthUpdateProfileMeta?.({ provider, profileId, ...(label ? { label } : {}) });
      setRenaming(null);
      void reloadBuiltinCatalog();
      void reloadAuthSummary();
      (window as any).__cf_toast?.success?.(t('common.sampleTitle'), t('settings.modelProfileRenamedOk'));
    } catch (e: any) {
      (window as any).__cf_toast?.error?.(t('common.sampleDetectFailTitle'), e?.message || t('common.sampleOpFailBody'));
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

              {authSummary?.profiles?.length ? (
                <div style={{ marginBottom: 14 }}>
                  <div className="cf-settingsModels__sectionTitle" style={{ marginBottom: 6 }}>
                    {t('settings.modelProfilesTitle')}
                  </div>
                  <div className="cf-help" style={{ marginBottom: 8 }}>
                    {t('settings.modelProfilesHint')}
                  </div>
                  <div className="cf-settingsModels__modelList" role="list">
                    {authSummary.profiles
                      .slice()
                      .sort((a, b) => (a.updatedAt ?? 0) - (b.updatedAt ?? 0))
                      .reverse()
                      .map((p) => {
                        const prov = String(p.provider ?? '').trim();
                        const pid = String(p.profileId ?? '').trim();
                        const activePid = authSummary.activeProfileIdByProvider?.[prov] ?? '';
                        const isActive = activePid && pid === activePid;
                        const testKey = `${prov}::${pid}`;
                        const isRenaming = Boolean(renaming && renaming.provider === prov && renaming.profileId === pid);
                        return (
                          <div key={`${prov}:${pid}`} className="cf-settingsModelRow" role="listitem">
                            <div className="cf-settingsModelRow__static">
                              <div className="cf-settingsModelRow__staticTitle" title={pid}>
                                {isRenaming ? (
                                  <input
                                    className="cf-input"
                                    value={renaming?.label ?? ''}
                                    placeholder={t('settings.modelProfileNamePh')}
                                    onChange={(e) =>
                                      setRenaming((s) => (s ? { ...s, label: e.target.value } : s))
                                    }
                                  />
                                ) : p.label ? (
                                  p.label
                                ) : (
                                  pid
                                )}
                              </div>
                              <div className="cf-settingsModelRow__staticSub">
                                {prov}
                                {p.environment ? ` · ${t(`settings.modelEnv_${p.environment}`)}` : ''}
                                {isActive ? ` · ${t('settings.modelProfileActive')}` : ''}
                              </div>
                            </div>
                            <div className="cf-row" style={{ flexShrink: 0, gap: 8, alignItems: 'center' }}>
                              {!isActive ? (
                                <button className="cf-btn cf-btnSmall" type="button" onClick={() => void onSetActiveProfile(prov, pid)}>
                                  {t('settings.modelProfileSetActive')}
                                </button>
                              ) : (
                                <span className="cf-settingsBadge">{t('settings.modelProfileActive')}</span>
                              )}
                              <button
                                className="cf-btn cf-btnSmall"
                                type="button"
                                disabled={Boolean(authTesting[testKey])}
                                onClick={() => void onTestProfile(prov as any, pid)}
                              >
                                {authTesting[testKey] ? t('settings.modelTesting') : t('settings.modelTest')}
                              </button>
                              {isRenaming ? (
                                <>
                                  <button className="cf-btn cf-btnPrimary cf-btnSmall" type="button" onClick={() => void commitRenameProfile()}>
                                    {t('common.save')}
                                  </button>
                                  <button className="cf-btn cf-btnGhost cf-btnSmall" type="button" onClick={cancelRenameProfile}>
                                    {t('common.cancel')}
                                  </button>
                                </>
                              ) : (
                                <button
                                  className="cf-btn cf-btnSmall"
                                  type="button"
                                  onClick={() => beginRenameProfile(prov, pid, p.label)}
                                >
                                  {t('settings.modelProfileRename')}
                                </button>
                              )}
                              <button className="cf-btn cf-btnGhost cf-btnSmall" type="button" onClick={() => void onRemoveProfile(prov, pid)}>
                                {t('common.delete')}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>
              ) : null}

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

          <div className="cf-settingsModels__sectionTitle" style={{ marginBottom: 6, marginTop: 18 }}>
            {t('settings.modePolicyTitle')}
          </div>
          <div className="cf-help" style={{ marginBottom: 8 }}>
            {t('settings.modePolicyHint')}
          </div>
          <textarea
            className="cf-textarea"
            rows={6}
            value={policyDraft}
            onChange={(e) => setPolicyDraft(e.target.value)}
            placeholder={t('settings.modePolicyPh')}
          />
          <div style={{ height: 10 }} />
          <div className="cf-row" style={{ gap: 8 }}>
            <button
              className="cf-btn cf-btnPrimary"
              type="button"
              onClick={() => {
                try {
                  const trimmed = policyDraft.trim();
                  if (trimmed) JSON.parse(trimmed);
                  updateSettings({ chatModePolicyOverridesJson: trimmed });
                  (window as any).__cf_toast?.success?.(t('common.sampleTitle'), t('settings.modePolicySavedOk'));
                } catch (e: any) {
                  (window as any).__cf_toast?.error?.(t('settings.modePolicyInvalidTitle'), e?.message || t('common.sampleOpFailBody'));
                }
              }}
            >
              {t('common.save')}
            </button>
            <button
              className="cf-btn cf-btnGhost"
              type="button"
              onClick={() => {
                setPolicyDraft('');
                updateSettings({ chatModePolicyOverridesJson: '' });
              }}
            >
              {t('settings.modePolicyClear')}
            </button>
          </div>

              <div className="cf-sub" style={{ marginBottom: 6 }}>
                {t('settings.modelEnvironment')}
              </div>
              <CfSelectWithHints
                className="cf-selectHint--wide"
                value={modelEnvironment}
                onChange={(v) => setModelEnvironment(v as 'personal' | 'work' | 'custom')}
                options={modelEnvSelectOptions}
                hintIconAriaBase={t('common.selectOptionHintAria')}
                aria-label={t('settings.modelEnvironment')}
              />
              <div style={{ height: 10 }} />

          <div className="cf-sub" style={{ marginBottom: 6 }}>
            {t('settings.modelProvider')}
          </div>
          <CfSelectWithHints
            className="cf-selectHint--wide"
            value={modelProvider}
            onChange={(v) => setModelProvider(v as 'deepseek' | 'openai' | 'anthropic')}
            options={modelProviderSelectOptions}
            hintIconAriaBase={t('common.selectOptionHintAria')}
            aria-label={t('settings.modelProvider')}
          />

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
            <button className="cf-btn" type="button" onClick={() => void onPickWorkspaceFolder()}>
              {t('settings.pickWorkspaceFolder')}
            </button>
          </div>
        </div>
        <div className="cf-card">
          <h3>{t('settings.workspaceToolCapabilities')}</h3>
          <div className="cf-divider" />
          <p className="cf-sub" style={{ marginBottom: 12 }}>
            {t('settings.workspaceToolCapabilitiesHint')}
          </p>
          {!activeWorkspacePath?.trim() ? (
            <div className="cf-help">{t('settings.noWorkspaceSelected')}</div>
          ) : (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 }}>
                {WORKSPACE_TOOL_IDS.map((id) => (
                  <Checkbox
                    key={id}
                    checked={accountToolsSel[id]}
                    onChange={(e) => setAccountToolsSel((s) => ({ ...s, [id]: e.target.checked }))}
                  >
                    {t(`workspace.tool_${id}`)}
                  </Checkbox>
                ))}
              </div>
              <button
                className="cf-btn cf-btnPrimary"
                type="button"
                disabled={accountToolsSaving}
                onClick={() => void onSaveAccountWorkspaceTools()}
              >
                {t('settings.saveWorkspaceTools')}
              </button>
            </>
          )}
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
            {t('settings.logLevel')}
          </div>
          <CfSelectWithHints
            className="cf-selectHint--wide"
            value={logLevel}
            onChange={(v) => updateSettings({ logLevel: v as typeof logLevel })}
            options={logLevelSelectOptions}
            hintIconAriaBase={t('common.selectOptionHintAria')}
            aria-label={t('settings.logLevel')}
          />
          <div className="cf-help">{t('settings.logLevelHelp')}</div>
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

      {null}

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

      <WorkspaceNewToolsModal
        open={toolModal.open}
        folderPath={toolModal.path}
        mode="create"
        onCancel={() => setToolModal({ open: false, path: null, mode: 'create' })}
        onConfirm={(tools) => void onConfirmWorkspaceTools(tools)}
      />
    </>
  );
};

export default SettingsPage;
