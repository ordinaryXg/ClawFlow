// 全局类型声明

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
  engineDeleteConversation: (conversationId: string) => Promise<{ success: boolean }>;
  engineUpsertConversation: (conversation: any) => Promise<{ success: boolean }>;
  engineGatewayStatus: () => Promise<{ status: string; port: number; uptimeMs?: number }>;
  engineGatewayStart: (params?: { port?: number }) => Promise<{ success: boolean }>;
  engineGatewayStop: () => Promise<{ success: boolean }>;
  engineGatewayRestart: (params?: { port?: number }) => Promise<{ success: boolean }>;
  engineGatewayGetLogs: (params?: { limit?: number }) => Promise<{ logs: Array<{ ts: number; level: string; msg: string }> }>;
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
    mode?: 'ask' | 'plan' | 'multitask';
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
  syncMainUiPrefs: (prefs: { closeButtonAction: 'quit' | 'minimizeToTray' }) => Promise<{ ok: true }>;
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
  workspaceGetDefaultPath: () => Promise<string>;
  workspaceSetDefaultRoot: (folderPath: string | null) => Promise<{ ok: true } | { ok: false; error: string }>;
  workspaceRemove: (
    folderPath: string
  ) => Promise<
    | { ok: true; newActivePath: string; deletedFromDisk: boolean }
    | { ok: false; error: string }
  >;
  workspaceSetActive: (
    folderPath: string,
    opts?: { fromMainShell?: boolean }
  ) => Promise<{ success: boolean; path: string }>;
  stickyGetBootstrap: () => Promise<{ role: 'main' | 'satellite'; satelliteWorkspace: string | null }>;
  stickyGetDetachedPaths: () => Promise<{ paths: string[] }>;
  stickyOpenSatellite: (params: { workspacePath: string }) => Promise<
    { ok: true; focused: boolean } | { ok: false; error: string }
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
    opts?: {
      tools?: import('./shared/workspace-tools').WorkspaceToolSelection;
      gitRemoteUrl?: string | null;
    }
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
  ) => Promise<
    | { ok: true; tools: Record<import('./shared/workspace-tools').WorkspaceToolId, boolean> }
    | { ok: false; error: string }
  >;
  workspaceSetToolSelection: (
    folderPath: string,
    tools: import('./shared/workspace-tools').WorkspaceToolSelection
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
    /** 收纳/恢复桌面快捷方式时必填当前工作区根路径（stash 位于应用缓存下对应工作区 blob） */
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
      kind?: string;
      conversationId: string;
      title: string;
      userPreview: string;
      assistantExcerpt: string;
      meta?: Record<string, unknown>;
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
    cb: (payload: {
      runId: string;
      slotId: string;
      approvalId: string;
      conversationId: string;
      tools: Array<{ name: string; argumentsPreview: string }>;
    }) => void
  ) => () => void;
  engineResolveToolApproval: (params: { approvalId: string; approved: boolean }) => Promise<{ ok: boolean }>;
  onSubAgentsUpdated: (cb: (payload: { workspaceRoot: string }) => void) => () => void;
  scrapeListJobs: () => Promise<{ jobs: unknown[] }>;
  scrapeReadArtifact: (params: { jobId: string }) => Promise<{ ok: true; text: string } | { ok: false; error?: string }>;
  onScrapeJobsUpdated: (cb: (payload: { workspaceRoot: string }) => void) => () => void;
}

declare global {
  interface Window {
    electronAPI: IElectronAPI;
  }
}

export {};
