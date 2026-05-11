import { contextBridge, ipcRenderer, webUtils } from 'electron';
import type { SkillMarketFetchResult } from './skill-market-shared';
import type { WorkspaceToolId, WorkspaceToolSelection } from './shared/workspace-tools';

// 暴露给渲染进程的 API 类型声明
export interface IElectronAPI {
  getVersion: () => Promise<string>;
  getGatewayStatus: () => Promise<string>;
  startGateway: () => Promise<void>;
  stopGateway: () => Promise<void>;
  getAppVersion: () => Promise<string>;
  setAppLanguage: (lang: 'zh' | 'en') => Promise<{ success: boolean }>;
  // Legacy OpenClaw chat & config APIs removed (desktop chat/gateway are built-in).
  // 新引擎（Phase 0：stub）
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
  // 技能管理
  getSkills: () => Promise<any>;
  installSkill: (skillName: string) => Promise<{ success: boolean }>;
  uninstallSkill: (skillName: string) => Promise<{ success: boolean }>;
  enableSkill: (skillName: string) => Promise<{ success: boolean }>;
  disableSkill: (skillName: string) => Promise<{ success: boolean }>;
  skillMarketGetIndex: (opts?: { forceRefresh?: boolean }) => Promise<SkillMarketFetchResult>;
  // 连接器管理
  getConnectors: () => Promise<any>;
  addConnector: (config: any) => Promise<{ success: boolean }>;
  updateConnector: (id: string, config: any) => Promise<{ success: boolean }>;
  deleteConnector: (id: string) => Promise<{ success: boolean }>;
  testConnector: (id: string) => Promise<{ success: boolean }>;
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
  workspaceGetActive: () => Promise<{ path: string; meta: unknown | null }>;
  workspaceListRecent: () => Promise<string[]>;
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
  workspacePickFolder: () => Promise<string | null>;
  workspaceEnsureInitialized: (folderPath: string, opts?: { tools?: WorkspaceToolSelection }) => Promise<{ meta: unknown }>;
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
        mimeType?: string;
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
  workspaceMkdir: (relativePath: string) => Promise<{ ok: boolean; error?: string }>;
  workspaceWriteTextFile: (params: { relativePath: string; content?: string; overwrite?: boolean }) => Promise<{ ok: boolean; error?: string }>;
  workspaceRenamePath: (params: { from: string; to: string; overwrite?: boolean }) => Promise<{ ok: boolean; error?: string }>;
  workspaceDeletePath: (relativePath: string) => Promise<{ ok: boolean; error?: string }>;
  clipboardWriteText: (text: string) => Promise<{ ok: boolean; error?: string }>;
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
  onWorkspaceChanged: (cb: (payload: { path: string }) => void) => () => void;
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
  subAgentsList: () => Promise<{ slots: unknown[] }>;
  subAgentsSaveAll: (slots: unknown[]) => Promise<{ ok: true } | { ok: false; error?: string }>;
  onSubAgentsUpdated: (cb: (payload: { workspaceRoot: string }) => void) => () => void;
  scrapeListJobs: () => Promise<{ jobs: unknown[] }>;
  scrapeReadArtifact: (params: { jobId: string }) => Promise<{ ok: true; text: string } | { ok: false; error?: string }>;
  onScrapeJobsUpdated: (cb: (payload: { workspaceRoot: string }) => void) => () => void;
}

// 通过 contextBridge 安全地暴露 API
contextBridge.exposeInMainWorld('electronAPI', {
  getVersion: () => ipcRenderer.invoke('openclaw:getVersion'),
  getGatewayStatus: () => ipcRenderer.invoke('openclaw:getGatewayStatus'),
  startGateway: () => ipcRenderer.invoke('openclaw:startGateway'),
  stopGateway: () => ipcRenderer.invoke('openclaw:stopGateway'),
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
  // 技能管理
  getSkills: () => ipcRenderer.invoke('openclaw:getSkills'),
  installSkill: (skillName: string) => ipcRenderer.invoke('openclaw:installSkill', skillName),
  uninstallSkill: (skillName: string) => ipcRenderer.invoke('openclaw:uninstallSkill', skillName),
  enableSkill: (skillName: string) => ipcRenderer.invoke('openclaw:enableSkill', skillName),
  disableSkill: (skillName: string) => ipcRenderer.invoke('openclaw:disableSkill', skillName),
  skillMarketGetIndex: (opts?: { forceRefresh?: boolean }) => ipcRenderer.invoke('skillMarket:getIndex', opts ?? {}),
  // 连接器管理
  getConnectors: () => ipcRenderer.invoke('openclaw:getConnectors'),
  addConnector: (config: any) => ipcRenderer.invoke('openclaw:addConnector', config),
  updateConnector: (id: string, config: any) => ipcRenderer.invoke('openclaw:updateConnector', id, config),
  deleteConnector: (id: string) => ipcRenderer.invoke('openclaw:deleteConnector', id),
  testConnector: (id: string) => ipcRenderer.invoke('openclaw:testConnector', id),
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
  workspaceGetActive: () => ipcRenderer.invoke('workspace:getActive'),
  workspaceListRecent: () => ipcRenderer.invoke('workspace:listRecent'),
  workspaceGetDefaultPath: () => ipcRenderer.invoke('workspace:getDefaultPath'),
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
  workspacePickFolder: () => ipcRenderer.invoke('workspace:pickFolder'),
  workspaceEnsureInitialized: (folderPath: string, opts?: { tools?: WorkspaceToolSelection }) =>
    ipcRenderer.invoke('workspace:ensureInitialized', folderPath, opts),
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
  workspaceMkdir: (relativePath: string) => ipcRenderer.invoke('workspace:mkdir', { relativePath }),
  workspaceWriteTextFile: (params: { relativePath: string; content?: string; overwrite?: boolean }) =>
    ipcRenderer.invoke('workspace:writeTextFile', params),
  workspaceRenamePath: (params: { from: string; to: string; overwrite?: boolean }) => ipcRenderer.invoke('workspace:renamePath', params),
  workspaceDeletePath: (relativePath: string) => ipcRenderer.invoke('workspace:deletePath', { relativePath }),
  clipboardWriteText: (text: string) => ipcRenderer.invoke('clipboard:writeText', text),
  workspaceGetChangeLog: (limit?: number) => ipcRenderer.invoke('workspace:getChangeLog', limit),
  workspaceAppendChangeLog: (payload: { conversationId: string; userPreview: string; assistantExcerpt: string }) =>
    ipcRenderer.invoke('workspace:appendChangeLog', payload),
  onWorkspaceChanged: (cb: (payload: { path: string }) => void) => {
    const handler = (_event: unknown, payload: unknown) => {
      if (payload && typeof payload === 'object' && typeof (payload as any).path === 'string') {
        cb({ path: (payload as { path: string }).path });
      }
    };
    ipcRenderer.on('workspace:changed', handler);
    return () => ipcRenderer.removeListener('workspace:changed', handler);
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
