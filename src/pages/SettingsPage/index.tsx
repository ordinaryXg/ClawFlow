import type { ReactNode } from 'react';
import { FC, useCallback, useEffect, useMemo, useState } from 'react';
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
import WorkspaceCreateModal from '../../components/workspace/WorkspaceCreateModal';
import SystemAgentsSettingsPanel from './SystemAgentsSettingsPanel';
import MemorySettingsPanel from './MemorySettingsPanel';
import AccountSettingsSection from './AccountSettingsSection';
import DataSettingsSection from './DataSettingsSection';
import HelpSettingsSection from './HelpSettingsSection';
import SystemSettingsSection from './SystemSettingsSection';
import FeishuSettingsPanel from './FeishuSettingsPanel';
import {
  DEFAULT_WORKSPACE_TOOL_SELECTION,
  type WorkspaceToolId,
  type WorkspaceToolSelection,
} from '../../shared/workspace-tools';
import { PLACEHOLDER_MESSAGING_CHANNELS } from '../../shared/messaging-channels';
import {
  OUTBOUND_MERGE_WINDOW_PREFS_EVENT,
  setCachedOutboundMergeWindowMs,
} from '../../shared/outbound-merge-window-client';
import {
  NAV_LABEL_KEYS,
  SECTION_META,
  SETTINGS_SECTION_IDS,
  type SettingsSectionId,
} from './settings-section-constants';

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
    logLevel,
    closeButtonAction,
    uiFontSize,
    updateSettings,
  } = useSettingsStore();

  const activeWorkspacePath = useWorkspaceStore((s) => s.activePath);
  const refreshWorkspace = useWorkspaceStore((s) => s.refresh);
  const commitNewWorkspace = useWorkspaceStore((s) => s.commitNewWorkspace);
  const fetchConversations = useChatStore((s) => s.fetchConversations);

  const [appCacheSettings, setAppCacheSettings] = useState<{
    effectiveRoot: string;
    defaultRoot: string;
    configuredRoot: string | null;
  } | null>(null);
  const [appCacheBusy, setAppCacheBusy] = useState(false);

  type WebSearchProviderUi = 'auto' | 'bocha' | 'brave' | 'duckduckgo' | 'searxng';
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

  const [activeSection, setActiveSection] = useState<SettingsSectionId>('account');
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [toolModal, setToolModal] = useState<{
    open: boolean;
    path: string | null;
    mode: 'create';
    gitRemoteUrl?: string | null;
  }>({ open: false, path: null, mode: 'create' });
  const [accountToolsSel, setAccountToolsSel] = useState<Record<WorkspaceToolId, boolean>>({
    ...DEFAULT_WORKSPACE_TOOL_SELECTION,
  });
  const [accountToolsSaving, setAccountToolsSaving] = useState(false);

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

  useEffect(() => {
    if (activeSection !== 'models') return;
    void reloadBuiltinCatalog();
  }, [activeSection, activeWorkspacePath, reloadBuiltinCatalog]);

  useEffect(() => {
    if (activeSection !== 'integrations') return;
    void fetchStatus();
    void fetchLogs(80);
  }, [activeSection, fetchStatus, fetchLogs]);

  useEffect(() => {
    if (activeSection !== 'account') return;
    void refreshWorkspace();
  }, [activeSection, refreshWorkspace]);

  useEffect(() => {
    if (activeSection !== 'system') return;
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
  }, [activeSection]);

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

  const onConfirmWorkspaceTools = async (tools: WorkspaceToolSelection) => {
    const { path: p, gitRemoteUrl } = toolModal;
    setToolModal({ open: false, path: null, mode: 'create', gitRemoteUrl: undefined });
    if (!p) return;
    await commitNewWorkspace(p, tools, gitRemoteUrl?.trim() ? { gitRemoteUrl: gitRemoteUrl.trim() } : undefined);
    await fetchConversations({ immediate: true });
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
      <AccountSettingsSection
        activeWorkspacePath={activeWorkspacePath}
        accountToolsSel={accountToolsSel}
        setAccountToolsSel={setAccountToolsSel}
        accountToolsSaving={accountToolsSaving}
        onSaveAccountWorkspaceTools={onSaveAccountWorkspaceTools}
        appVersion={appVersion}
      />
    );
  } else if (activeSection === 'agents') {
    detailPanels = <SystemAgentsSettingsPanel />;
  } else if (activeSection === 'system') {
    detailPanels = <SystemSettingsSection />;
  } else if (activeSection === 'memory') {
    detailPanels = <MemorySettingsPanel />;
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
      <>
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
          <button className="cf-btn cf-btnGhost" style={{ marginRight: 8 }} type="button" onClick={() => void fetchLogs(120)}>
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
        </div>

        <FeishuSettingsPanel activeWorkspacePath={activeWorkspacePath} />

        {PLACEHOLDER_MESSAGING_CHANNELS.map((ch) => (
          <div key={ch.id} className="cf-card cf-settingsMessagingPlaceholder">
            <h3>{t(ch.nameKey)}</h3>
            <div className="cf-divider" />
            <div className="cf-help">{t('settings.messagingPlaceholderHint')}</div>
          </div>
        ))}
      </>
    );
  } else if (activeSection === 'data') {
    detailPanels = <DataSettingsSection activeWorkspacePath={activeWorkspacePath} />;
  } else if (activeSection === 'help') {
    detailPanels = <HelpSettingsSection appVersion={appVersion} />;
  }

  return (
    <>
      <div className="cf-topbar">
        <div className="cf-pageTitle">
          <h2>{t('settings.title')}</h2>
        </div>
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
            {activeSection === 'agents' ? (
              <p className="cf-help" style={{ marginTop: 0 }}>
                {t('settings.sectionAgentsHint')}
              </p>
            ) : null}
          </header>
          <div className="cf-settingsDetail__panels">{detailPanels}</div>
        </div>
      </div>

      <WorkspaceCreateModal
        open={createModalOpen}
        onCancel={() => setCreateModalOpen(false)}
        onContinueToTools={(folderPath, opts) => {
          setCreateModalOpen(false);
          setToolModal({
            open: true,
            path: folderPath,
            mode: 'create',
            gitRemoteUrl: opts?.gitRemoteUrl ?? undefined,
          });
        }}
      />

      <WorkspaceNewToolsModal
        open={toolModal.open}
        folderPath={toolModal.path}
        mode="create"
        onCancel={() => setToolModal({ open: false, path: null, mode: 'create', gitRemoteUrl: undefined })}
        onConfirm={(tools) => void onConfirmWorkspaceTools(tools)}
      />
    </>
  );
};

export default SettingsPage;
