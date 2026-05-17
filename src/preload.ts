import { contextBridge, ipcRenderer, webUtils } from 'electron';
import type { WorkspaceToolId, WorkspaceToolSelection } from './shared/workspace-tools';

// 暴露给渲染进程的 API 类型声明
export interface IElectronAPI {
  /** 应用版本；网关状态/启停映射到内置 engineGateway */
  getVersion: () => Promise<string>;
  getGatewayStatus: () => Promise<string>;
  startGateway: () => Promise<void>;
  stopGateway: () => Promise<void>;
  getAppVersion: () => Promise<string>;
  setAppLanguage: (lang: 'zh' | 'en') => Promise<{ success: boolean }>;
  // 内置引擎
  engineSendMessage: (params: { conversationId: string; userText: string; mode?: 'ask' | 'plan' | 'multitask'; modelId?: string }) => Promise<any>;
  engineGetConversations: () => Promise<any>;
  engineUpsertConversation: (conversation: any) => Promise<{ success: boolean }>;
  engineDeleteConversation: (conversationId: string) => Promise<{ success: boolean }>;
  engineGatewayStatus: () => Promise<{ status: string; port: number }>;
  engineGatewayStart: (params?: { port?: number }) => Promise<{ success: boolean }>;
  engineGatewayStop: () => Promise<{ success: boolean }>;
  engineAuthListProfiles: () => Promise<{
    version: 2;
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
  }>;
  engineAuthUpsertProfile: (params: {
    provider: string;
    token: string;
    profileId?: string;
    label?: string;
    environment?: 'personal' | 'work' | 'custom';
  }) => Promise<{ profileId: string }>;
  engineAuthRemoveProfile: (params: { provider: string; profileId: string }) => Promise<{ removed: boolean }>;
  engineAuthUpdateProfileMeta: (params: {
    provider: string;
    profileId: string;
    label?: string;
    environment?: 'personal' | 'work' | 'custom';
  }) => Promise<{ success: boolean }>;
  engineAuthSetActiveProfile: (params: { provider: string; profileId: string }) => Promise<{ success: boolean }>;
  engineAuthTestConnection: (params: { provider: 'deepseek' | 'openai' | 'anthropic'; profileId: string }) => Promise<
    | { ok: true; latencyMs: number; sample: string }
    | { ok: false; latencyMs?: number; errorCode: string; message: string }
  >;
  engineGetChatModels: () => Promise<{
    defaultModelId: string | null;
    models: Array<{ id: string; label: string; available: boolean }>;
  }>;
  engineClassifyConversationMode: (params: { userText: string; modelId?: string }) => Promise<
    | {
        ok: true;
        category: 'a' | 'b' | 'c' | 'd' | 'e';
        categoryLabel: string;
        mode: 'ask' | 'plan' | 'multitask';
        summary: string;
        fallback?: boolean;
      }
    | { ok: false; error: string }
  >;
  engineEstimateNextRequestContext: (params: {
    conversationId: string;
    pendingUserText: string;
    modelId?: string | null;
  }) => Promise<
    | {
        ok: true;
        utf8Bytes: number;
        loadUnits: number;
        budgetUnits: number;
        ratio: number;
        isOverflow: boolean;
        isNearOverflow: boolean;
      }
    | { ok: false; error: string }
  >;
  engineGetRuntimeSettings: () => Promise<{
    maxSendMessageToolLoopSteps: number;
    defaultMaxSendMessageToolLoopSteps: number;
    minMaxSendMessageToolLoopSteps: number;
    maxMaxSendMessageToolLoopSteps: number;
  }>;
  engineSaveRuntimeSettings: (params: { maxSendMessageToolLoopSteps?: number }) => Promise<
    { ok: true; maxSendMessageToolLoopSteps: number } | { ok: false; error: string }
  >;
  engineGetWebSearchSettings: () => Promise<{
    enabled: boolean;
    provider: 'auto' | 'bocha' | 'brave' | 'duckduckgo' | 'searxng';
    bochaBaseUrl: string;
    braveBaseUrl: string;
    searxngBaseUrl: string;
    timeoutSeconds: number;
    bochaApiKeyConfigured: boolean;
    braveApiKeyConfigured: boolean;
    searxngConfigured: boolean;
    searxngApiKeyConfigured: boolean;
    bochaApiKeySavedInFile: boolean;
    braveApiKeySavedInFile: boolean;
    searxngApiKeySavedInFile: boolean;
  }>;
  engineSaveWebSearchSettings: (params: {
    enabled?: boolean;
    provider?: 'auto' | 'bocha' | 'brave' | 'duckduckgo' | 'searxng';
    bochaBaseUrl?: string;
    braveBaseUrl?: string;
    searxngBaseUrl?: string;
    timeoutSeconds?: number;
    bochaApiKey?: string;
    clearBochaApiKey?: boolean;
    braveApiKey?: string;
    clearBraveApiKey?: boolean;
    searxngApiKey?: string;
    clearSearxngApiKey?: boolean;
  }) => Promise<{ ok: true }>;
  messagingGetFeishuBots: () => Promise<{
    bots: Array<{
      id: string;
      name: string;
      appId: string;
      appSecretConfigured: boolean;
      appSecretSavedInFile: boolean;
      defaultReceiveId: string;
      receiveIdType: 'open_id' | 'user_id' | 'union_id' | 'email' | 'chat_id';
      bridgeEnabled: boolean;
      bridgeWorkspacePath: string;
      bridgeConversationId: string;
      bridgeSenderLabel: string;
    }>;
  }>;
  messagingSaveFeishuBots: (params: {
    bots: Array<{
      id: string;
      name: string;
      appId?: string;
      appSecret?: string;
      clearAppSecret?: boolean;
      defaultReceiveId?: string;
      receiveIdType?: 'open_id' | 'user_id' | 'union_id' | 'email' | 'chat_id';
      bridgeEnabled?: boolean;
      bridgeWorkspacePath?: string;
      bridgeConversationId?: string;
      bridgeSenderLabel?: string;
    }>;
  }) => Promise<{ ok: true } | { ok: false; error: string }>;
  messagingTestFeishu: (params?: { botId?: string; appId?: string; appSecret?: string }) => Promise<
    { ok: true; expireSeconds: number } | { ok: false; error: string; detail?: string }
  >;
  messagingSendFeishuTestMessage: (params: {
    botId?: string;
    text: string;
    receiveId?: string;
    receiveIdType?: 'open_id' | 'user_id' | 'union_id' | 'email' | 'chat_id';
    appId?: string;
    appSecret?: string;
  }) => Promise<{ ok: true } | { ok: false; error: string; detail?: string }>;
  engineSendMessageStream: (params: {
    conversationId: string;
    userText: string;
    modelId?: string;
    mode?: 'ask' | 'plan';
  }) => Promise<{ success: boolean; message: string }>;
  onEngineChatStream: (
    cb: (p: { kind: 'delta'; conversationId: string; text: string }) => void
  ) => () => void;
  onEmbeddedBrowserNavigate: (cb: (p: { url: string }) => void) => () => void;
  onChatConversationsDirty: (cb: (p?: { workspaceRoot?: string }) => void) => () => void;
  onNavigate: (cb: (path: string) => void) => () => void;
  setShellViewWindowAppearance: (params: { compact: boolean }) => Promise<{ ok: boolean; error?: string }>;
  windowMinimize: () => Promise<void>;
  windowToggleMaximize: () => Promise<void>;
  windowClose: () => Promise<void>;
  windowReload: () => Promise<void>;
  windowToggleDevTools: () => Promise<void>;
  windowUndo: () => Promise<void>;
  windowRedo: () => Promise<void>;
  windowCut: () => Promise<void>;
  windowCopy: () => Promise<void>;
  windowPaste: () => Promise<void>;
  windowSelectAll: () => Promise<void>;
  quitApp: () => Promise<void>;
  appRelaunch: () => Promise<void>;
  appGetAppCacheSettings: () => Promise<{
    effectiveRoot: string;
    defaultRoot: string;
    configuredRoot: string | null;
  }>;
  appSetAppCacheRoot: (
    folderPath: string | null
  ) => Promise<{ ok: true; effectiveRoot: string } | { ok: false; error: string }>;
  workspaceGetActive: () => Promise<{ path: string; meta: unknown | null }>;
  intelligenceGetProfile: () => Promise<
    | {
        ok: true;
        xp: number;
        level: number;
        progress01: number;
        xpIntoLevel: number;
        xpForNext: number;
        totalUserManualRounds: number;
        lastEvolutionAtMs?: number;
      }
    | { ok: false; error: string }
  >;
  intelligenceTriggerEvolutionTest: (params?: {
    conversationId?: string;
  }) => Promise<{ ok: true; runId?: string } | { ok: false; error: string }>;
  workspaceListRecent: () => Promise<Array<{ path: string; gitRemoteUrl: string | null }>>;
  workspaceListUnreadSummaries: (params: { paths: string[] }) => Promise<{
    summaries: Array<{ workspaceRoot: string; total: number }>;
  }>;
  workspaceSetActive: (
    folderPath: string,
    opts?: { fromMainShell?: boolean }
  ) => Promise<{ success: boolean; path: string }>;
  stickyGetBootstrap: () => Promise<{ role: 'main' | 'satellite'; satelliteWorkspace: string | null }>;
  stickyGetDetachedPaths: () => Promise<{ paths: string[] }>;
  stickyOpenSatellite: (params: { workspacePath: string }) => Promise<
    | { ok: true; focused: boolean }
    | { ok: false; error: string }
  >;
  stickyMergeSatellite: (params: { workspacePath: string }) => Promise<
    { ok: true; closed: boolean } | { ok: false; error: string }
  >;
  onStickyDetachedPaths: (cb: (payload: { paths: string[] }) => void) => () => void;
  workspaceAddFromAbsolutePath: (
    absPath: string
  ) => Promise<{ ok: true; path: string } | { ok: false; error: string }>;
  workspaceStatAbsolutePath: (
    absPath: string
  ) => Promise<{ ok: true; path: string; isDirectory: boolean } | { ok: false; error: 'not_found' }>;
  workspacePickFolder: (opts?: { title?: string }) => Promise<string | null>;
  workspaceEnsureInitialized: (
    folderPath: string,
    opts?: { tools?: WorkspaceToolSelection; gitRemoteUrl?: string | null }
  ) => Promise<{ meta: unknown }>;
  workspaceGitClone: (params: {
    remoteUrl: string;
    parentDir: string;
  }) => Promise<{ ok: true; dest: string } | { ok: false; error: string }>;
  workspaceGitPull: (
    folderPath: string
  ) => Promise<{ ok: true; stdout: string } | { ok: false; error: string }>;
  workspaceGitPush: (
    folderPath: string
  ) => Promise<{ ok: true; stdout: string } | { ok: false; error: string }>;
  workspaceResetCache: (
    folderPath: string
  ) => Promise<
    | { ok: true; removed: { agent: boolean; subagent: boolean } }
    | { ok: false; error: string }
  >;
  workspaceGetToolSelection: (
    folderPath: string
  ) => Promise<{ ok: true; tools: Record<WorkspaceToolId, boolean> } | { ok: false; error: string }>;
  workspaceSetToolSelection: (
    folderPath: string,
    tools: WorkspaceToolSelection
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
  workspaceListDir: (
    relativePath?: string
  ) => Promise<{ ok: boolean; entries: Array<{ name: string; kind: 'file' | 'dir' }>; error?: string }>;
  workspaceReadFilePreview: (
    relativePath: string
  ) => Promise<
    | {
        ok: true;
        content: string;
        truncated: boolean;
        isBinary: boolean;
        isImage?: boolean;
        isPdf?: boolean;
        mimeType?: string;
        textExtract?: string;
        numpages?: number;
      }
    | { ok: false; error: string }
  >;
  workspaceResolveAbsolutePath: (relativePath: string) => Promise<{
    ok: true;
    workspaceRoot: string;
    relativePath: string;
    absolutePath: string;
  }>;
  workspaceRevealInExplorer: (relativePath: string) => Promise<{ ok: boolean; error?: string }>;
  /** 从渲染进程 File（拖放）取绝对路径，需 Electron webUtils */
  getPathForFile: (file: File) => string;
  workspaceImportExternalPaths: (params: {
    targetRelativeDir: string;
    sourceAbsolutePaths: string[];
    overwrite?: boolean;
  }) => Promise<{ ok: true } | { ok: false; error: string }>;
  workspaceCopyChatDropFiles: (params: {
    sourceAbsolutePaths: string[];
  }) => Promise<
    | { ok: true; items: Array<{ destAbs: string; displayName: string }> }
    | { ok: false; error: string }
  >;
  workspaceMkdir: (relativePath: string) => Promise<{ ok: boolean; error?: string }>;
  workspaceWriteTextFile: (params: { relativePath: string; content?: string; overwrite?: boolean }) => Promise<{ ok: boolean; error?: string }>;
  workspaceRenamePath: (params: { from: string; to: string; overwrite?: boolean }) => Promise<{ ok: boolean; error?: string }>;
  workspaceDeletePath: (relativePath: string) => Promise<{ ok: boolean; error?: string }>;
  clipboardWriteText: (text: string) => Promise<{ ok: boolean; error?: string }>;
  appOpenPath: (absolutePath: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  appGetFileIconDataUrl: (
    absolutePath: string
  ) => Promise<{ ok: true; dataUrl: string } | { ok: false; error?: string }>;
  appSetPathHidden: (params: {
    absolutePath: string;
    hidden: boolean;
    workspacePath?: string;
  }) => Promise<
    | { ok: true; mode: 'stashed'; stashedPath: string; originalPath: string; leftSourceInPlace?: boolean }
    | { ok: true; mode: 'unchanged' }
    | { ok: true; mode: 'restored'; originalPath: string }
    | { ok: true; mode: 'noop' }
    | { ok: false; error: string }
  >;
  appSweepLauncherStash: (params: { workspacePath: string }) => Promise<{ ok: true } | { ok: false; error: string }>;
  workspaceGetChangeLog: (limit?: number) => Promise<{
    ok: boolean;
    entries: Array<{
      id: string;
      at: number;
      conversationId: string;
      title: string;
      userPreview: string;
      assistantExcerpt: string;
    }>;
  }>;
  workspaceAppendChangeLog: (payload: {
    conversationId: string;
    userPreview: string;
    assistantExcerpt: string;
  }) => Promise<{ ok: boolean; error?: string }>;
  memoryFtsSearch: (params: {
    query: string;
    limit?: number;
    skillName?: string;
  }) => Promise<
    | {
        ok: true;
        hits: Array<{
          id: number;
          source_kind: string;
          source_path: string;
          skill_name: string | null;
          title: string | null;
          snippet: string;
          rank: number;
        }>;
      }
    | { ok: false; error: string }
  >;
  memoryFtsRebuild: () => Promise<
    { ok: true; indexed: number; pruned: number } | { ok: false; error: string }
  >;
  workspaceSkillsList: () => Promise<
    | {
        ok: true;
        skills: Array<{
          skillRootRel: string;
          name: string;
          skillMdRel: string;
          referenceFiles: Array<{ relPath: string }>;
          enabled?: boolean;
        }>;
      }
    | { ok: false; error: string; skills: [] }
  >;
  workspaceSkillsReadFile: (relativePath: string) => Promise<{ ok: true; content: string } | { ok: false; error: string }>;
  workspaceSkillsSetEnabled: (params: { skillRootRel: string; enabled: boolean }) => Promise<{ ok: true } | { ok: false; error?: string }>;
  workspaceSkillsDeleteSkill: (skillRootRel: string) => Promise<{ ok: true } | { ok: false; error?: string }>;
  onWorkspaceChanged: (cb: (payload: { path: string }) => void) => () => void;
  onWorkspaceChangelogUpdated: (cb: () => void) => () => void;
  todoTriggersList: () => Promise<{ triggers: unknown[] }>;
  todoTriggersSaveAll: (triggers: unknown[]) => Promise<{ ok: true } | { ok: false; error?: string }>;
  todoTriggersSetAiReceipt: (params: {
    triggerId: string;
    receiptText: string;
  }) => Promise<{ ok: true } | { ok: false; error?: string }>;
  onTodoTriggerFired: (
    cb: (payload: {
      workspaceRoot: string;
      triggerId: string;
      title: string;
      text: string;
      submitToModel: boolean;
    }) => void
  ) => () => void;
  onTodoTriggersUpdated: (cb: (payload: { workspaceRoot: string }) => void) => () => void;
  subAgentsList: () => Promise<{ slots: unknown[]; runSnapshots?: Record<string, unknown> }>;
  subAgentsSaveAll: (slots: unknown[]) => Promise<{ ok: true } | { ok: false; error?: string }>;
  subAgentsRun: (params: { slotId: string; taskText: string; conversationId: string; modelId?: string }) => Promise<
    | { ok: true; runId: string }
    | { ok: false; error: string; runId?: string }
  >;
  onSubAgentsRunDelta: (cb: (payload: { runId: string; slotId: string; text: string }) => void) => () => void;
  onSubAgentsRunFinal: (
    cb: (payload: { runId: string; slotId: string; ok: boolean; message?: string; error?: string }) => void
  ) => () => void;
  onSubAgentsToolApprovalNeeded: (
    cb: (payload: { runId: string; slotId: string; approvalId: string; conversationId: string; tools: Array<{ name: string; argumentsPreview: string }> }) => void
  ) => () => void;
  engineResolveToolApproval: (params: { approvalId: string; approved: boolean }) => Promise<{ ok: boolean }>;
  onSubAgentsUpdated: (cb: (payload: { workspaceRoot: string }) => void) => () => void;
  scrapeListJobs: () => Promise<{ jobs: unknown[] }>;
  scrapeReadArtifact: (params: { jobId: string }) => Promise<{ ok: true; text: string } | { ok: false; error?: string }>;
  onScrapeJobsUpdated: (cb: (payload: { workspaceRoot: string }) => void) => () => void;
}

// 通过 contextBridge 安全地暴露 API
contextBridge.exposeInMainWorld('electronAPI', {
  getVersion: () => ipcRenderer.invoke('app:getVersion'),
  getGatewayStatus: async () => {
    const r = (await ipcRenderer.invoke('engineGateway:status')) as { status?: string } | null;
    return String(r?.status ?? 'unknown');
  },
  startGateway: () => ipcRenderer.invoke('engineGateway:start', {}),
  stopGateway: () => ipcRenderer.invoke('engineGateway:stop'),
  getAppVersion: () => ipcRenderer.invoke('app:getVersion'),
  setAppLanguage: (lang: 'zh' | 'en') => ipcRenderer.invoke('app:setLanguage', lang),
  // 新引擎（Phase 0：stub）
  engineSendMessage: (params: { conversationId: string; userText: string; mode?: 'ask' | 'plan' | 'multitask'; modelId?: string }) =>
    ipcRenderer.invoke('engine:sendMessage', params),
  engineGetConversations: () => ipcRenderer.invoke('engine:getConversations'),
  engineDeleteConversation: (conversationId: string) => ipcRenderer.invoke('engine:deleteConversation', conversationId),
  engineUpsertConversation: (conversation: any) => ipcRenderer.invoke('engine:upsertConversation', conversation),
  engineGatewayStatus: () => ipcRenderer.invoke('engineGateway:status'),
  engineGatewayStart: (params?: { port?: number }) => ipcRenderer.invoke('engineGateway:start', params ?? {}),
  engineGatewayStop: () => ipcRenderer.invoke('engineGateway:stop'),
  engineGatewayRestart: (params?: { port?: number }) => ipcRenderer.invoke('engineGateway:restart', params ?? {}),
  engineGatewayGetLogs: (params?: { limit?: number }) => ipcRenderer.invoke('engineGateway:logs', params ?? {}),
  engineAuthListProfiles: () => ipcRenderer.invoke('engineAuth:listProfiles'),
  engineAuthUpsertProfile: (params: {
    provider: string;
    token: string;
    profileId?: string;
    label?: string;
    environment?: 'personal' | 'work' | 'custom';
  }) => ipcRenderer.invoke('engineAuth:upsertProfile', params),
  engineAuthRemoveProfile: (params: { provider: string; profileId: string }) =>
    ipcRenderer.invoke('engineAuth:removeProfile', params),
  engineAuthUpdateProfileMeta: (params: {
    provider: string;
    profileId: string;
    label?: string;
    environment?: 'personal' | 'work' | 'custom';
  }) => ipcRenderer.invoke('engineAuth:updateProfileMeta', params),
  engineAuthSetActiveProfile: (params: { provider: string; profileId: string }) =>
    ipcRenderer.invoke('engineAuth:setActiveProfile', params),
  engineAuthTestConnection: (params: { provider: 'deepseek' | 'openai' | 'anthropic'; profileId: string }) =>
    ipcRenderer.invoke('engineAuth:testConnection', params),
  engineGetChatModels: () => ipcRenderer.invoke('engine:getChatModels'),
  engineClassifyConversationMode: (params: { userText: string; modelId?: string }) =>
    ipcRenderer.invoke('engine:classifyConversationMode', params),
  engineEstimateNextRequestContext: (params) => ipcRenderer.invoke('engine:estimateNextRequestContext', params),
  engineGetRuntimeSettings: () => ipcRenderer.invoke('engine:getRuntimeSettings'),
  engineSaveRuntimeSettings: (params: { maxSendMessageToolLoopSteps?: number }) =>
    ipcRenderer.invoke('engine:saveRuntimeSettings', params),
  engineGetWebSearchSettings: () => ipcRenderer.invoke('engine:getWebSearchSettings'),
  engineSaveWebSearchSettings: (params) => ipcRenderer.invoke('engine:saveWebSearchSettings', params),
  messagingGetFeishuBots: () => ipcRenderer.invoke('messaging:getFeishuBots'),
  messagingSaveFeishuBots: (params: {
    bots: Array<{
      id: string;
      name: string;
      appId?: string;
      appSecret?: string;
      clearAppSecret?: boolean;
      defaultReceiveId?: string;
      receiveIdType?: 'open_id' | 'user_id' | 'union_id' | 'email' | 'chat_id';
      bridgeEnabled?: boolean;
      bridgeWorkspacePath?: string;
      bridgeConversationId?: string;
      bridgeSenderLabel?: string;
    }>;
  }) => ipcRenderer.invoke('messaging:saveFeishuBots', params),
  messagingTestFeishu: (params?: { botId?: string; appId?: string; appSecret?: string }) =>
    ipcRenderer.invoke('messaging:testFeishu', params ?? {}),
  messagingSendFeishuTestMessage: (params: {
    botId?: string;
    text: string;
    receiveId?: string;
    receiveIdType?: 'open_id' | 'user_id' | 'union_id' | 'email' | 'chat_id';
    appId?: string;
    appSecret?: string;
  }) => ipcRenderer.invoke('messaging:sendFeishuTestMessage', params),
  engineSendMessageStream: (params: {
    conversationId: string;
    userText: string;
    modelId?: string;
    mode?: 'ask' | 'plan' | 'multitask';
  }) => ipcRenderer.invoke('engine:sendMessageStream', params),
  onEngineChatStream: (cb: (p: { kind: 'delta'; conversationId: string; text: string }) => void) => {
    const handler = (_event: unknown, payload: unknown) => {
      if (
        payload &&
        typeof payload === 'object' &&
        (payload as { kind?: string }).kind === 'delta' &&
        typeof (payload as { conversationId?: string }).conversationId === 'string' &&
        typeof (payload as { text?: string }).text === 'string'
      ) {
        cb(payload as { kind: 'delta'; conversationId: string; text: string });
      }
    };
    ipcRenderer.on('engine:chatStream', handler);
    return () => ipcRenderer.removeListener('engine:chatStream', handler);
  },
  onEmbeddedBrowserNavigate: (cb: (p: { url: string }) => void) => {
    const handler = (_event: unknown, payload: unknown) => {
      if (payload && typeof payload === 'object' && typeof (payload as { url?: string }).url === 'string') {
        cb({ url: (payload as { url: string }).url });
      }
    };
    ipcRenderer.on('embedded-browser:navigate', handler);
    return () => ipcRenderer.removeListener('embedded-browser:navigate', handler);
  },
  onChatConversationsDirty: (cb: (p?: { workspaceRoot?: string }) => void) => {
    const handler = (_event: unknown, payload: unknown) => {
      if (payload && typeof payload === 'object' && typeof (payload as { workspaceRoot?: unknown }).workspaceRoot === 'string') {
        const w = String((payload as { workspaceRoot: string }).workspaceRoot).trim();
        if (w) cb({ workspaceRoot: w });
        else cb();
      } else {
        cb();
      }
    };
    ipcRenderer.on('chat:conversationsDirty', handler);
    return () => ipcRenderer.removeListener('chat:conversationsDirty', handler);
  },
  onNavigate: (cb: (path: string) => void) => {
    const handler = (_event: unknown, path: unknown) => {
      if (typeof path === 'string') cb(path);
    };
    ipcRenderer.on('app:navigate', handler);
    return () => ipcRenderer.removeListener('app:navigate', handler);
  },
  setShellViewWindowAppearance: (params: { compact: boolean }) =>
    ipcRenderer.invoke('window:setShellViewAppearance', params),
  windowMinimize: () => ipcRenderer.invoke('window:minimize'),
  windowToggleMaximize: () => ipcRenderer.invoke('window:toggleMaximize'),
  windowClose: () => ipcRenderer.invoke('window:close'),
  windowReload: () => ipcRenderer.invoke('window:reload'),
  windowToggleDevTools: () => ipcRenderer.invoke('window:toggleDevTools'),
  windowUndo: () => ipcRenderer.invoke('window:undo'),
  windowRedo: () => ipcRenderer.invoke('window:redo'),
  windowCut: () => ipcRenderer.invoke('window:cut'),
  windowCopy: () => ipcRenderer.invoke('window:copy'),
  windowPaste: () => ipcRenderer.invoke('window:paste'),
  windowSelectAll: () => ipcRenderer.invoke('window:selectAll'),
  quitApp: () => ipcRenderer.invoke('app:quit'),
  appRelaunch: () => ipcRenderer.invoke('app:relaunch'),
  appGetAppCacheSettings: () => ipcRenderer.invoke('app:getAppCacheSettings'),
  appSetAppCacheRoot: (folderPath: string | null) => ipcRenderer.invoke('app:setAppCacheRoot', folderPath),
  syncMainUiPrefs: (prefs: { closeButtonAction: 'quit' | 'minimizeToTray' }) =>
    ipcRenderer.invoke('app:syncMainUiPrefs', prefs) as Promise<{ ok: true }>,
  workspaceGetActive: () => ipcRenderer.invoke('workspace:getActive'),
  intelligenceGetProfile: () => ipcRenderer.invoke('intelligence:getProfile'),
  intelligenceTriggerEvolutionTest: (params?: { conversationId?: string }) =>
    ipcRenderer.invoke('intelligence:triggerEvolutionTest', params ?? {}),
  workspaceListRecent: () => ipcRenderer.invoke('workspace:listRecent'),
  workspaceListUnreadSummaries: (params: { paths: string[] }) =>
    ipcRenderer.invoke('workspace:listUnreadSummaries', params),
  workspaceGetDefaultPath: () => ipcRenderer.invoke('workspace:getDefaultPath'),
  workspaceSetDefaultRoot: (folderPath: string | null) =>
    ipcRenderer.invoke('workspace:setDefaultRoot', folderPath) as Promise<{ ok: true } | { ok: false; error: string }>,
  workspaceRemove: (folderPath: string) => ipcRenderer.invoke('workspace:remove', folderPath),
  workspaceSetActive: (folderPath: string, opts?: { fromMainShell?: boolean }) =>
    ipcRenderer.invoke('workspace:setActive', folderPath, opts ?? {}),
  stickyGetBootstrap: () => ipcRenderer.invoke('sticky:getBootstrap'),
  stickyGetDetachedPaths: () => ipcRenderer.invoke('sticky:getDetachedPaths'),
  stickyOpenSatellite: (params: { workspacePath: string }) => ipcRenderer.invoke('sticky:openSatellite', params),
  stickyMergeSatellite: (params: { workspacePath: string }) => ipcRenderer.invoke('sticky:mergeSatellite', params),
  onStickyDetachedPaths: (cb: (payload: { paths: string[] }) => void) => {
    const handler = (_e: unknown, payload: unknown) => {
      if (payload && typeof payload === 'object' && Array.isArray((payload as { paths?: unknown }).paths)) {
        cb({ paths: (payload as { paths: string[] }).paths });
      }
    };
    ipcRenderer.on('sticky:detachedPaths', handler);
    return () => ipcRenderer.removeListener('sticky:detachedPaths', handler);
  },
  workspaceAddFromAbsolutePath: (
    absPath: string
  ) => ipcRenderer.invoke('workspace:addFromAbsolutePath', absPath) as Promise<
    { ok: true; path: string } | { ok: false; error: string }
  >,
  workspaceStatAbsolutePath: (absPath: string) =>
    ipcRenderer.invoke('workspace:statAbsolutePath', absPath) as Promise<
      { ok: true; path: string; isDirectory: boolean } | { ok: false; error: 'not_found' }
    >,
  workspacePickFolder: (opts?: { title?: string }) => ipcRenderer.invoke('workspace:pickFolder', opts),
  workspaceEnsureInitialized: (
    folderPath: string,
    opts?: { tools?: WorkspaceToolSelection; gitRemoteUrl?: string | null }
  ) => ipcRenderer.invoke('workspace:ensureInitialized', folderPath, opts),
  workspaceGitClone: (params: { remoteUrl: string; parentDir: string }) =>
    ipcRenderer.invoke('workspace:gitClone', params),
  workspaceGitPull: (folderPath: string) => ipcRenderer.invoke('workspace:gitPull', folderPath),
  workspaceGitPush: (folderPath: string) => ipcRenderer.invoke('workspace:gitPush', folderPath),
  workspaceResetCache: (folderPath: string) => ipcRenderer.invoke('workspace:resetCache', folderPath),
  workspaceGetToolSelection: (folderPath: string) =>
    ipcRenderer.invoke('workspace:getToolSelection', folderPath) as Promise<
      { ok: true; tools: Record<WorkspaceToolId, boolean> } | { ok: false; error: string }
    >,
  workspaceSetToolSelection: (folderPath: string, tools: WorkspaceToolSelection) =>
    ipcRenderer.invoke('workspace:setToolSelection', folderPath, tools) as Promise<{ ok: true } | { ok: false; error: string }>,
  workspaceListDir: (relativePath?: string) => ipcRenderer.invoke('workspace:listDir', relativePath),
  workspaceReadFilePreview: (relativePath: string) => ipcRenderer.invoke('workspace:readFilePreview', relativePath),
  workspaceResolveAbsolutePath: (relativePath: string) => ipcRenderer.invoke('workspace:resolveAbsolutePath', relativePath),
  workspaceRevealInExplorer: (relativePath: string) => ipcRenderer.invoke('workspace:revealInExplorer', relativePath),
  getPathForFile: (file: File) => webUtils.getPathForFile(file as never),
  workspaceImportExternalPaths: (params: {
    targetRelativeDir: string;
    sourceAbsolutePaths: string[];
    overwrite?: boolean;
  }) => ipcRenderer.invoke('workspace:importExternalPaths', params),
  workspaceCopyChatDropFiles: (params: { sourceAbsolutePaths: string[] }) =>
    ipcRenderer.invoke('workspace:copyChatDropFiles', params),
  workspaceMkdir: (relativePath: string) => ipcRenderer.invoke('workspace:mkdir', { relativePath }),
  workspaceWriteTextFile: (params: { relativePath: string; content?: string; overwrite?: boolean }) =>
    ipcRenderer.invoke('workspace:writeTextFile', params),
  workspaceRenamePath: (params: { from: string; to: string; overwrite?: boolean }) => ipcRenderer.invoke('workspace:renamePath', params),
  workspaceDeletePath: (relativePath: string) => ipcRenderer.invoke('workspace:deletePath', { relativePath }),
  clipboardWriteText: (text: string) => ipcRenderer.invoke('clipboard:writeText', text),
  appOpenPath: (absolutePath: string) => ipcRenderer.invoke('app:openPath', absolutePath),
  appGetFileIconDataUrl: (absolutePath: string) => ipcRenderer.invoke('app:getFileIconDataUrl', absolutePath),
  appSetPathHidden: (params: { absolutePath: string; hidden: boolean; workspacePath?: string }) =>
    ipcRenderer.invoke('app:setPathHidden', params),
  appSweepLauncherStash: (params: { workspacePath: string }) =>
    ipcRenderer.invoke('app:sweepLauncherStash', params),
  workspaceGetChangeLog: (limit?: number) => ipcRenderer.invoke('workspace:getChangeLog', limit),
  workspaceAppendChangeLog: (payload: { conversationId: string; userPreview: string; assistantExcerpt: string }) =>
    ipcRenderer.invoke('workspace:appendChangeLog', payload),
  memoryFtsSearch: (params: { query: string; limit?: number; skillName?: string }) =>
    ipcRenderer.invoke('memoryFts:search', params),
  memoryFtsRebuild: () => ipcRenderer.invoke('memoryFts:rebuild'),
  workspaceSkillsList: () => ipcRenderer.invoke('workspaceSkills:list'),
  workspaceSkillsReadFile: (relativePath: string) => ipcRenderer.invoke('workspaceSkills:readFile', relativePath),
  workspaceSkillsSetEnabled: (params: { skillRootRel: string; enabled: boolean }) =>
    ipcRenderer.invoke('workspaceSkills:setEnabled', params),
  workspaceSkillsDeleteSkill: (skillRootRel: string) => ipcRenderer.invoke('workspaceSkills:deleteSkill', { skillRootRel }),
  onWorkspaceChanged: (cb: (payload: { path: string }) => void) => {
    const handler = (_event: unknown, payload: unknown) => {
      if (payload && typeof payload === 'object' && typeof (payload as any).path === 'string') {
        cb({ path: (payload as { path: string }).path });
      }
    };
    ipcRenderer.on('workspace:changed', handler);
    return () => ipcRenderer.removeListener('workspace:changed', handler);
  },
  onWorkspaceChangelogUpdated: (cb: () => void) => {
    const handler = () => cb();
    ipcRenderer.on('workspace:changelogUpdated', handler);
    return () => ipcRenderer.removeListener('workspace:changelogUpdated', handler);
  },
  todoTriggersList: () => ipcRenderer.invoke('todoTriggers:list'),
  todoTriggersSaveAll: (triggers: unknown[]) => ipcRenderer.invoke('todoTriggers:saveAll', triggers),
  todoTriggersSetAiReceipt: (params: { triggerId: string; receiptText: string }) =>
    ipcRenderer.invoke('todoTriggers:setAiReceipt', params),
  onTodoTriggerFired: (cb) => {
    const handler = (_event: unknown, payload: unknown) => {
      if (!payload || typeof payload !== 'object') return;
      const p = payload as Record<string, unknown>;
      if (typeof p.workspaceRoot !== 'string' || typeof p.text !== 'string') return;
      cb({
        workspaceRoot: p.workspaceRoot,
        triggerId: typeof p.triggerId === 'string' ? p.triggerId : '',
        title: typeof p.title === 'string' ? p.title : '',
        text: p.text,
        submitToModel: Boolean(p.submitToModel),
      });
    };
    ipcRenderer.on('todo-trigger:fired', handler);
    return () => ipcRenderer.removeListener('todo-trigger:fired', handler);
  },
  onTodoTriggersUpdated: (cb) => {
    const handler = (_event: unknown, payload: unknown) => {
      if (!payload || typeof payload !== 'object') return;
      const p = payload as Record<string, unknown>;
      if (typeof p.workspaceRoot === 'string') cb({ workspaceRoot: p.workspaceRoot });
    };
    ipcRenderer.on('todo-triggers:updated', handler);
    return () => ipcRenderer.removeListener('todo-triggers:updated', handler);
  },
  subAgentsList: () => ipcRenderer.invoke('subAgents:list'),
  subAgentsSaveAll: (slots: unknown[]) => ipcRenderer.invoke('subAgents:saveAll', slots),
  subAgentsRun: (params: { slotId: string; taskText: string; conversationId: string; modelId?: string }) =>
    ipcRenderer.invoke('subAgents:run', params),
  onSubAgentsRunDelta: (cb) => {
    const handler = (_event: unknown, payload: unknown) => {
      if (!payload || typeof payload !== 'object') return;
      const p = payload as Record<string, unknown>;
      if (typeof p.runId === 'string' && typeof p.slotId === 'string' && typeof p.text === 'string') {
        cb({ runId: p.runId, slotId: p.slotId, text: p.text });
      }
    };
    ipcRenderer.on('subAgents:runDelta', handler);
    return () => ipcRenderer.removeListener('subAgents:runDelta', handler);
  },
  onSubAgentsRunFinal: (cb) => {
    const handler = (_event: unknown, payload: unknown) => {
      if (!payload || typeof payload !== 'object') return;
      const p = payload as Record<string, unknown>;
      if (typeof p.runId !== 'string' || typeof p.slotId !== 'string') return;
      cb({
        runId: p.runId,
        slotId: p.slotId,
        ok: Boolean(p.ok),
        message: typeof p.message === 'string' ? p.message : undefined,
        error: typeof p.error === 'string' ? p.error : undefined,
      });
    };
    ipcRenderer.on('subAgents:runFinal', handler);
    return () => ipcRenderer.removeListener('subAgents:runFinal', handler);
  },
  onSubAgentsToolApprovalNeeded: (cb) => {
    const handler = (_event: unknown, payload: unknown) => {
      if (!payload || typeof payload !== 'object') return;
      const p = payload as Record<string, unknown>;
      if (typeof p.approvalId !== 'string' || typeof p.conversationId !== 'string') return;
      cb({
        runId: typeof p.runId === 'string' ? p.runId : '',
        slotId: typeof p.slotId === 'string' ? p.slotId : '',
        approvalId: p.approvalId,
        conversationId: p.conversationId,
        tools: Array.isArray(p.tools)
          ? p.tools
              .filter((x) => x && typeof x === 'object')
              .map((x) => ({
                name: String((x as any).name ?? 'unknown'),
                argumentsPreview: String((x as any).argumentsPreview ?? ''),
              }))
          : [],
      });
    };
    ipcRenderer.on('subAgents:toolApprovalNeeded', handler);
    return () => ipcRenderer.removeListener('subAgents:toolApprovalNeeded', handler);
  },
  engineResolveToolApproval: (params: { approvalId: string; approved: boolean }) =>
    ipcRenderer.invoke('engine:resolveToolApproval', params),
  onSubAgentsUpdated: (cb) => {
    const handler = (_event: unknown, payload: unknown) => {
      if (!payload || typeof payload !== 'object') return;
      const p = payload as Record<string, unknown>;
      if (typeof p.workspaceRoot === 'string') cb({ workspaceRoot: p.workspaceRoot });
    };
    ipcRenderer.on('subAgents:updated', handler);
    return () => ipcRenderer.removeListener('subAgents:updated', handler);
  },
  scrapeListJobs: () => ipcRenderer.invoke('scrape:listJobs'),
  scrapeReadArtifact: (params: { jobId: string }) => ipcRenderer.invoke('scrape:readArtifact', params),
  onScrapeJobsUpdated: (cb) => {
    const handler = (_event: unknown, payload: unknown) => {
      if (!payload || typeof payload !== 'object') return;
      const p = payload as Record<string, unknown>;
      if (typeof p.workspaceRoot === 'string') cb({ workspaceRoot: p.workspaceRoot });
    };
    ipcRenderer.on('scrape:jobsUpdated', handler);
    return () => ipcRenderer.removeListener('scrape:jobsUpdated', handler);
  },
} as IElectronAPI);
