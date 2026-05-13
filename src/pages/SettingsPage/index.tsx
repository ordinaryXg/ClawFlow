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
import WorkspaceCreateModal from '../../components/workspace/WorkspaceCreateModal';
import {
  DEFAULT_WORKSPACE_TOOL_SELECTION,
  WORKSPACE_TOOL_IDS,
  type WorkspaceToolId,
  type WorkspaceToolSelection,
} from '../../shared/workspace-tools';
import { PLACEHOLDER_MESSAGING_CHANNELS } from '../../shared/messaging-channels';
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
    closeButtonAction,
    uiFontSize,
    updateSettings,
    resetSettings,
  } = useSettingsStore();

  const activeWorkspacePath = useWorkspaceStore((s) => s.activePath);
  const workspaceMeta = useWorkspaceStore((s) => s.meta);
  const workspaceLoading = useWorkspaceStore((s) => s.loading);
  const refreshWorkspace = useWorkspaceStore((s) => s.refresh);
  const commitNewWorkspace = useWorkspaceStore((s) => s.commitNewWorkspace);
  const fetchConversations = useChatStore((s) => s.fetchConversations);

  const [defaultWorkspacePathDisplay, setDefaultWorkspacePathDisplay] = useState<string>('');
  const [appCacheSettings, setAppCacheSettings] = useState<{
    effectiveRoot: string;
    defaultRoot: string;
    configuredRoot: string | null;
  } | null>(null);
  const [appCacheBusy, setAppCacheBusy] = useState(false);

  type WebSearchProviderUi = 'auto' | 'brave' | 'duckduckgo' | 'searxng';
  const [wsEnabled, setWsEnabled] = useState(true);
  const [wsProvider, setWsProvider] = useState<WebSearchProviderUi>('auto');
  const [wsBraveBase, setWsBraveBase] = useState('');
  const [wsSearxBase, setWsSearxBase] = useState('');
  const [wsTimeout, setWsTimeout] = useState(25);
  const [wsBraveKeyDraft, setWsBraveKeyDraft] = useState('');
  const [wsSearxKeyDraft, setWsSearxKeyDraft] = useState('');
  const [wsBraveSavedInFile, setWsBraveSavedInFile] = useState(false);
  const [wsSearxKeySavedInFile, setWsSearxKeySavedInFile] = useState(false);
  const [wsBraveConfigured, setWsBraveConfigured] = useState(false);
  const [wsSearxKeyConfigured, setWsSearxKeyConfigured] = useState(false);
  const [wsClearBraveOnSave, setWsClearBraveOnSave] = useState(false);
  const [wsClearSearxOnSave, setWsClearSearxOnSave] = useState(false);

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
  const [connectorCount, setConnectorCount] = useState(0);

  type FeishuRecvUi = 'open_id' | 'user_id' | 'union_id' | 'email' | 'chat_id';
  const [feishuAppId, setFeishuAppId] = useState('');
  const [feishuSecretDraft, setFeishuSecretDraft] = useState('');
  const [feishuClearSecretOnSave, setFeishuClearSecretOnSave] = useState(false);
  const [feishuDefaultReceiveId, setFeishuDefaultReceiveId] = useState('');
  const [feishuReceiveIdType, setFeishuReceiveIdType] = useState<FeishuRecvUi>('chat_id');
  const [feishuAppSecretConfigured, setFeishuAppSecretConfigured] = useState(false);
  const [feishuAppSecretSavedInFile, setFeishuAppSecretSavedInFile] = useState(false);
  const [feishuSaving, setFeishuSaving] = useState(false);
  const [feishuTesting, setFeishuTesting] = useState(false);
  const [feishuSendingTest, setFeishuSendingTest] = useState(false);
  const [feishuTestText, setFeishuTestText] = useState('');
  const [feishuBridgeEnabled, setFeishuBridgeEnabled] = useState(false);
  const [feishuBridgeWorkspace, setFeishuBridgeWorkspace] = useState('');
  const [feishuBridgeConvId, setFeishuBridgeConvId] = useState('');
  const [feishuBridgeSenderLabel, setFeishuBridgeSenderLabel] = useState('');

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

  const reloadFeishuMessaging = useCallback(async () => {
    try {
      const s = await window.electronAPI?.messagingGetFeishuSettings?.();
      if (!s) return;
      setFeishuAppId(s.appId ?? '');
      setFeishuReceiveIdType(s.receiveIdType);
      setFeishuDefaultReceiveId(s.defaultReceiveId ?? '');
      setFeishuSecretDraft('');
      setFeishuClearSecretOnSave(false);
      setFeishuAppSecretConfigured(s.appSecretConfigured);
      setFeishuAppSecretSavedInFile(s.appSecretSavedInFile);
      setFeishuBridgeEnabled(Boolean(s.bridgeEnabled));
      setFeishuBridgeWorkspace(s.bridgeWorkspacePath ?? '');
      setFeishuBridgeConvId(s.bridgeConversationId ?? '');
      setFeishuBridgeSenderLabel(s.bridgeSenderLabel ?? '');
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (activeSection !== 'models') return;
    void reloadBuiltinCatalog();
  }, [activeSection, activeWorkspacePath, reloadBuiltinCatalog]);

  useEffect(() => {
    if (activeSection !== 'integrations' && activeSection !== 'system') return;
    void reloadConnectorsCount();
  }, [activeSection, reloadConnectorsCount]);

  useEffect(() => {
    if (activeSection !== 'integrations') return;
    void fetchStatus();
    void fetchLogs(80);
    void reloadFeishuMessaging();
  }, [activeSection, fetchStatus, reloadFeishuMessaging, fetchLogs]);

  useEffect(() => {
    if (activeSection !== 'account') return;
    void refreshWorkspace();
  }, [activeSection, refreshWorkspace]);

  useEffect(() => {
    if (activeSection !== 'system') return;
    void (async () => {
      try {
        const p = await window.electronAPI?.workspaceGetDefaultPath?.();
        setDefaultWorkspacePathDisplay(typeof p === 'string' ? p : '');
      } catch {
        setDefaultWorkspacePathDisplay('');
      }
      try {
        const s = await window.electronAPI?.engineGetWebSearchSettings?.();
        if (s) {
          setWsEnabled(s.enabled);
          setWsProvider(s.provider);
          setWsBraveBase(s.braveBaseUrl ?? '');
          setWsSearxBase(s.searxngBaseUrl ?? '');
          setWsTimeout(s.timeoutSeconds ?? 25);
          setWsBraveSavedInFile(s.braveApiKeySavedInFile);
          setWsSearxKeySavedInFile(Boolean(s.searxngApiKeySavedInFile));
          setWsBraveConfigured(s.braveApiKeyConfigured);
          setWsSearxKeyConfigured(s.searxngApiKeyConfigured);
          setWsBraveKeyDraft('');
          setWsSearxKeyDraft('');
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

  const onSave = async () => {
    updateSettings({
      theme,
      language,
      autoStartGateway,
      logLevel,
      closeButtonAction,
      uiFontSize,
    });
    try {
      await window.electronAPI?.engineSaveWebSearchSettings?.({
        enabled: wsEnabled,
        provider: wsProvider,
        braveBaseUrl: wsBraveBase,
        searxngBaseUrl: wsSearxBase,
        timeoutSeconds: wsTimeout,
        clearBraveApiKey: wsClearBraveOnSave,
        ...(wsBraveKeyDraft.trim() ? { braveApiKey: wsBraveKeyDraft.trim() } : {}),
        clearSearxngApiKey: wsClearSearxOnSave,
        ...(wsSearxKeyDraft.trim() ? { searxngApiKey: wsSearxKeyDraft.trim() } : {}),
      });
      setWsClearBraveOnSave(false);
      setWsClearSearxOnSave(false);
      setWsBraveKeyDraft('');
      setWsSearxKeyDraft('');
      const s2 = await window.electronAPI?.engineGetWebSearchSettings?.();
      if (s2) {
        setWsBraveSavedInFile(s2.braveApiKeySavedInFile);
        setWsSearxKeySavedInFile(Boolean(s2.searxngApiKeySavedInFile));
        setWsBraveConfigured(s2.braveApiKeyConfigured);
        setWsSearxKeyConfigured(s2.searxngApiKeyConfigured);
      }
    } catch (e: any) {
      (window as any).__cf_toast?.error?.(t('settings.webSearchSaveFail'), e?.message || t('common.sampleOpFailBody'));
      return;
    }
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
    document.documentElement.dataset.cfFont = st.uiFontSize;
    void window.electronAPI?.syncMainUiPrefs?.({ closeButtonAction: st.closeButtonAction });
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

  const onPickWorkspaceFolder = () => {
    setCreateModalOpen(true);
  };

  const onPickDefaultWorkspaceRoot = async () => {
    const picked = await window.electronAPI?.workspacePickFolder?.({ title: t('settings.defaultWorkspacePickTitle') });
    if (!picked?.trim()) return;
    if (!window.confirm(t('settings.defaultWorkspacePickConfirm', { path: picked.trim() }))) return;
    const res = await window.electronAPI?.workspaceSetDefaultRoot?.(picked.trim());
    if (res?.ok) {
      const p2 = await window.electronAPI?.workspaceGetDefaultPath?.();
      setDefaultWorkspacePathDisplay(typeof p2 === 'string' ? p2 : '');
      await refreshWorkspace();
      (window as any).__cf_toast?.success?.(t('settings.savedTitle'), t('settings.defaultWorkspaceSaved'));
    } else {
      (window as any).__cf_toast?.error?.(
        t('settings.defaultWorkspaceSaveFail'),
        res && 'error' in res ? res.error : undefined
      );
    }
  };

  const onResetDefaultWorkspaceRoot = async () => {
    if (!window.confirm(t('settings.defaultWorkspaceResetConfirm'))) return;
    const res = await window.electronAPI?.workspaceSetDefaultRoot?.(null);
    if (res?.ok) {
      const p2 = await window.electronAPI?.workspaceGetDefaultPath?.();
      setDefaultWorkspacePathDisplay(typeof p2 === 'string' ? p2 : '');
      await refreshWorkspace();
      (window as any).__cf_toast?.success?.(t('settings.savedTitle'), t('settings.defaultWorkspaceRestored'));
    } else {
      (window as any).__cf_toast?.error?.(
        t('settings.defaultWorkspaceSaveFail'),
        res && 'error' in res ? res.error : undefined
      );
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

  const onConfirmWorkspaceTools = async (tools: WorkspaceToolSelection) => {
    const { path: p, gitRemoteUrl } = toolModal;
    setToolModal({ open: false, path: null, mode: 'create', gitRemoteUrl: undefined });
    if (!p) return;
    await commitNewWorkspace(p, tools, gitRemoteUrl?.trim() ? { gitRemoteUrl: gitRemoteUrl.trim() } : undefined);
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
      { value: 'brave', label: t('settings.webSearchProvider_brave'), hint: t('settings.webSearchHint_brave') },
      { value: 'searxng', label: t('settings.webSearchProvider_searxng'), hint: t('settings.webSearchHint_searxng') },
      { value: 'duckduckgo', label: t('settings.webSearchProvider_ddg'), hint: t('settings.webSearchHint_ddg') },
    ],
    [t],
  );

  const feishuReceiveIdSelectOptions = useMemo(
    () => [
      { value: 'chat_id', label: 'chat_id', hint: t('settings.messagingFeishuRecvHint_chat_id') },
      { value: 'open_id', label: 'open_id', hint: t('settings.messagingFeishuRecvHint_open_id') },
      { value: 'user_id', label: 'user_id', hint: t('settings.messagingFeishuRecvHint_user_id') },
      { value: 'union_id', label: 'union_id', hint: t('settings.messagingFeishuRecvHint_union_id') },
      { value: 'email', label: 'email', hint: t('settings.messagingFeishuRecvHint_email') },
    ],
    [t],
  );

  const onSaveFeishuMessaging = async () => {
    setFeishuSaving(true);
    try {
      await window.electronAPI?.messagingSaveFeishuSettings?.({
        appId: feishuAppId,
        defaultReceiveId: feishuDefaultReceiveId,
        receiveIdType: feishuReceiveIdType,
        clearAppSecret: feishuClearSecretOnSave,
        ...(feishuSecretDraft.trim() ? { appSecret: feishuSecretDraft.trim() } : {}),
        bridgeEnabled: feishuBridgeEnabled,
        bridgeWorkspacePath: feishuBridgeWorkspace,
        bridgeConversationId: feishuBridgeConvId,
        bridgeSenderLabel: feishuBridgeSenderLabel,
      });
      await reloadFeishuMessaging();
      (window as any).__cf_toast?.success?.(t('settings.messagingFeishuSavedTitle'), t('settings.messagingFeishuSavedBody'));
    } catch (e: any) {
      (window as any).__cf_toast?.error?.(t('settings.messagingFeishuSaveFail'), e?.message || t('common.sampleOpFailBody'));
    } finally {
      setFeishuSaving(false);
    }
  };

  const onTestFeishuConnection = async () => {
    setFeishuTesting(true);
    try {
      const r = await window.electronAPI?.messagingTestFeishu?.({
        ...(feishuAppId.trim() ? { appId: feishuAppId.trim() } : {}),
        ...(feishuSecretDraft.trim() ? { appSecret: feishuSecretDraft.trim() } : {}),
      });
      if (r?.ok) {
        (window as any).__cf_toast?.success?.(
          t('settings.messagingFeishuTestOkTitle'),
          t('settings.messagingFeishuTestOkBody', { seconds: r.expireSeconds }),
        );
      } else {
        const raw = r as { error?: string; detail?: string };
        const err = raw.error ?? '';
        const detail = typeof raw.detail === 'string' ? raw.detail.trim() : '';
        console.error('[Settings] Feishu test connection failed', { error: err, detail: detail || undefined });
        const map: Record<string, string> = {
          missing_credentials: t('settings.messagingErr_missing_credentials'),
        };
        const msg = err && map[err] ? map[err] : err || t('common.sampleOpFailBody');
        const body = detail ? `${msg}\n\n${detail}` : msg;
        (window as any).__cf_toast?.error?.(t('settings.messagingFeishuTestFailTitle'), body.slice(0, 8000));
      }
    } catch (e: any) {
      (window as any).__cf_toast?.error?.(t('settings.messagingFeishuTestFailTitle'), e?.message || t('common.sampleOpFailBody'));
    } finally {
      setFeishuTesting(false);
    }
  };

  const onSendFeishuTestMessage = async () => {
    const text = feishuTestText.trim();
    if (!text) {
      (window as any).__cf_toast?.error?.(t('settings.messagingFeishuTestMsgEmptyTitle'), t('settings.messagingFeishuTestMsgEmptyBody'));
      return;
    }
    setFeishuSendingTest(true);
    try {
      const r = await window.electronAPI?.messagingSendFeishuTestMessage?.({
        text,
        receiveId: feishuDefaultReceiveId.trim() || undefined,
        receiveIdType: feishuReceiveIdType,
        ...(feishuAppId.trim() ? { appId: feishuAppId.trim() } : {}),
        ...(feishuSecretDraft.trim() ? { appSecret: feishuSecretDraft.trim() } : {}),
      });
      if (r?.ok) {
        (window as any).__cf_toast?.success?.(t('settings.messagingFeishuSendOkTitle'), t('settings.messagingFeishuSendOkBody'));
      } else {
        const raw = r as { error?: string; detail?: string };
        const err = raw.error ?? '';
        const detail = typeof raw.detail === 'string' ? raw.detail.trim() : '';
        console.error('[Settings] Feishu send test message failed', { error: err, detail: detail || undefined });
        const map: Record<string, string> = {
          missing_credentials: t('settings.messagingErr_missing_credentials'),
          missing_receive_id: t('settings.messagingErr_missing_receive_id'),
          empty_text: t('settings.messagingErr_empty_text'),
        };
        const msg = err && map[err] ? map[err] : err || t('common.sampleOpFailBody');
        const body = detail ? `${msg}\n\n${detail}` : msg;
        (window as any).__cf_toast?.error?.(t('settings.messagingFeishuSendFailTitle'), body.slice(0, 8000));
      }
    } catch (e: any) {
      (window as any).__cf_toast?.error?.(t('settings.messagingFeishuSendFailTitle'), e?.message || t('common.sampleOpFailBody'));
    } finally {
      setFeishuSendingTest(false);
    }
  };

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
          <h3>{t('settings.connectorsCount')}</h3>
          <div className="cf-divider" />
          <div className="cf-help" style={{ marginBottom: 12 }}>
            {t('settings.connectorsCountHint', { count: connectorCount })}
          </div>
          <div className="cf-row" style={{ flexWrap: 'wrap', gap: 8 }}>
            <button className="cf-btn cf-btnGhost cf-btnSmall" type="button" onClick={() => void reloadConnectorsCount()}>
              {t('settings.refreshIntegrationStatus')}
            </button>
            <button className="cf-btn cf-btnPrimary cf-btnSmall" type="button" onClick={() => navigate('/connectors')}>
              {t('settings.openConnectors')}
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
          <h3>{t('settings.defaultWorkspaceTitle')}</h3>
          <div className="cf-divider" />
          <div className="cf-help" style={{ marginBottom: 10 }}>
            {t('settings.defaultWorkspaceHelp')}
          </div>
          <div className="cf-settingsModels__mono" style={{ wordBreak: 'break-all', marginBottom: 12 }}>
            {defaultWorkspacePathDisplay || '—'}
          </div>
          <div className="cf-row" style={{ flexWrap: 'wrap', gap: 8 }}>
            <button className="cf-btn cf-btnPrimary cf-btnSmall" type="button" onClick={() => void onPickDefaultWorkspaceRoot()}>
              {t('settings.defaultWorkspacePick')}
            </button>
            <button className="cf-btn cf-btnGhost cf-btnSmall" type="button" onClick={() => void onResetDefaultWorkspaceRoot()}>
              {t('settings.defaultWorkspaceResetBuiltIn')}
            </button>
          </div>
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
          <div className="cf-help">{t('settings.webSearchSaveFooter')}</div>
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

        <div className="cf-card">
          <h3>{t('settings.messagingFeishuTitle')}</h3>
          <div className="cf-divider" />
          <div className="cf-help" style={{ marginBottom: 12 }}>
            {t('settings.messagingFeishuLead')}{' '}
            <a href="https://open.feishu.cn/document/server-docs/im-v1/message/create" target="_blank" rel="noreferrer">
              {t('settings.messagingFeishuDocIm')}
            </a>
            {' · '}
            <a
              href="https://open.feishu.cn/document/ukTMukTMukTM/ukTMzUjLzMzM14yMyMTN/authorization/access-token/tenant_access_token_internal"
              target="_blank"
              rel="noreferrer"
            >
              {t('settings.messagingFeishuDocToken')}
            </a>
          </div>
          <div className="cf-sub" style={{ marginBottom: 6 }}>
            {t('settings.messagingFeishuAppId')}
          </div>
          <input
            className="cf-input"
            style={{ width: '100%', marginBottom: 10 }}
            value={feishuAppId}
            onChange={(e) => setFeishuAppId(e.target.value)}
            placeholder={t('settings.messagingFeishuAppIdPh')}
            autoComplete="off"
          />
          <div className="cf-sub" style={{ marginBottom: 6 }}>
            {t('settings.messagingFeishuAppSecret')}
          </div>
          <input
            className="cf-input"
            type="password"
            style={{ width: '100%', marginBottom: 6 }}
            value={feishuSecretDraft}
            onChange={(e) => setFeishuSecretDraft(e.target.value)}
            placeholder={t('settings.messagingFeishuAppSecretPh')}
            autoComplete="new-password"
          />
          <div className="cf-help" style={{ marginBottom: 8 }}>
            {feishuAppSecretConfigured
              ? t('settings.messagingFeishuSecretStatus_ok')
              : t('settings.messagingFeishuSecretStatus_none')}
            {feishuAppSecretSavedInFile ? ` · ${t('settings.messagingFeishuSecretStatus_file')}` : ''}
          </div>
          {feishuAppSecretSavedInFile ? (
            <div className="cf-row" style={{ flexWrap: 'wrap', gap: 8, marginBottom: 12, alignItems: 'center' }}>
              {feishuClearSecretOnSave ? (
                <>
                  <span className="cf-help" style={{ color: 'var(--warning, #c9a227)' }}>{t('settings.messagingFeishuClearPending')}</span>
                  <button type="button" className="cf-btn cf-btnGhost cf-btnSmall" onClick={() => setFeishuClearSecretOnSave(false)}>
                    {t('settings.messagingFeishuClearCancel')}
                  </button>
                </>
              ) : (
                <button type="button" className="cf-btn cf-btnGhost cf-btnSmall" onClick={() => setFeishuClearSecretOnSave(true)}>
                  {t('settings.messagingFeishuClearSecret')}
                </button>
              )}
            </div>
          ) : (
            <div style={{ height: 4, marginBottom: 10 }} />
          )}
          <div className="cf-row cf-settingsPage__row" style={{ marginBottom: 12 }}>
            <div>
              <div className="cf-sub">
                <strong style={{ color: 'var(--text)' }}>{t('settings.messagingFeishuReceiveIdType')}</strong>
              </div>
            </div>
            <div style={{ minWidth: 220, flex: '1 1 200px' }}>
              <CfSelectWithHints
                className="cf-selectHint--wide"
                value={feishuReceiveIdType}
                onChange={(v) => setFeishuReceiveIdType(v as FeishuRecvUi)}
                options={feishuReceiveIdSelectOptions}
                hintIconAriaBase={t('common.selectOptionHintAria')}
                aria-label={t('settings.messagingFeishuReceiveIdType')}
              />
            </div>
          </div>
          <div className="cf-sub" style={{ marginBottom: 6 }}>
            {t('settings.messagingFeishuDefaultReceiveId')}
          </div>
          <input
            className="cf-input"
            style={{ width: '100%', marginBottom: 10 }}
            value={feishuDefaultReceiveId}
            onChange={(e) => setFeishuDefaultReceiveId(e.target.value)}
            placeholder={t('settings.messagingFeishuDefaultReceiveIdPh')}
            autoComplete="off"
          />

          <div className="cf-divider" style={{ margin: '16px 0' }} />
          <h4 style={{ margin: '0 0 8px', fontSize: 15, color: 'var(--text)' }}>{t('settings.messagingFeishuBridgeTitle')}</h4>
          <div className="cf-help" style={{ marginBottom: 12, color: 'var(--muted)' }}>
            {t('settings.messagingFeishuBridgeHelp')}
          </div>
          <div style={{ marginBottom: 10 }}>
            <Checkbox checked={feishuBridgeEnabled} onChange={(e) => setFeishuBridgeEnabled(e.target.checked)}>
              {t('settings.messagingFeishuBridgeEnabled')}
            </Checkbox>
          </div>
          <div className="cf-sub" style={{ marginBottom: 6 }}>
            {t('settings.messagingFeishuBridgeWorkspace')}
          </div>
          <div className="cf-row" style={{ gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
            <input
              className="cf-input"
              style={{ flex: '1 1 200px', minWidth: 0 }}
              value={feishuBridgeWorkspace}
              onChange={(e) => setFeishuBridgeWorkspace(e.target.value)}
              placeholder={t('settings.messagingFeishuBridgeWorkspacePh')}
              autoComplete="off"
            />
            <button
              type="button"
              className="cf-btn cf-btnGhost cf-btnSmall"
              disabled={!activeWorkspacePath?.trim()}
              onClick={() => setFeishuBridgeWorkspace(activeWorkspacePath?.trim() ?? '')}
            >
              {t('settings.messagingFeishuBridgeFillActive')}
            </button>
          </div>
          <div className="cf-sub" style={{ marginBottom: 6 }}>
            {t('settings.messagingFeishuBridgeConvId')}
          </div>
          <input
            className="cf-input"
            style={{ width: '100%', marginBottom: 10 }}
            value={feishuBridgeConvId}
            onChange={(e) => setFeishuBridgeConvId(e.target.value)}
            placeholder={t('settings.messagingFeishuBridgeConvIdPh')}
            autoComplete="off"
          />
          <div className="cf-sub" style={{ marginBottom: 6 }}>
            {t('settings.messagingFeishuBridgeSenderLabel')}
          </div>
          <input
            className="cf-input"
            style={{ width: '100%', marginBottom: 12 }}
            value={feishuBridgeSenderLabel}
            onChange={(e) => setFeishuBridgeSenderLabel(e.target.value)}
            placeholder={t('settings.messagingFeishuBridgeSenderLabelPh')}
            autoComplete="off"
          />

          <div className="cf-row" style={{ flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
            <button
              type="button"
              className="cf-btn cf-btnPrimary cf-btnSmall"
              disabled={feishuSaving}
              onClick={() => void onSaveFeishuMessaging()}
            >
              {feishuSaving ? t('settings.messagingFeishuSaving') : t('settings.messagingFeishuSave')}
            </button>
            <button
              type="button"
              className="cf-btn cf-btnSmall"
              disabled={feishuTesting}
              onClick={() => void onTestFeishuConnection()}
            >
              {feishuTesting ? t('settings.messagingFeishuTesting') : t('settings.messagingFeishuTest')}
            </button>
          </div>
          <div className="cf-sub" style={{ marginBottom: 6 }}>
            {t('settings.messagingFeishuTestMsgLabel')}
          </div>
          <input
            className="cf-input"
            style={{ width: '100%', marginBottom: 10 }}
            value={feishuTestText}
            onChange={(e) => setFeishuTestText(e.target.value)}
            placeholder={t('settings.messagingFeishuTestMsgPh')}
          />
          <button
            type="button"
            className="cf-btn cf-btnGhost cf-btnSmall"
            disabled={feishuSendingTest}
            onClick={() => void onSendFeishuTestMessage()}
          >
            {feishuSendingTest ? t('settings.messagingFeishuSendingTest') : t('settings.messagingFeishuSendTest')}
          </button>
        </div>

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
