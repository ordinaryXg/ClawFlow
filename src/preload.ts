import { contextBridge, ipcRenderer } from 'electron';
import type { SkillMarketFetchResult } from './skill-market-shared';

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
  workspaceSetActive: (folderPath: string) => Promise<{ success: boolean; path: string }>;
  workspacePickFolder: () => Promise<string | null>;
  workspaceEnsureInitialized: (folderPath: string) => Promise<{ meta: unknown }>;
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
  workspaceSetActive: (folderPath: string) => ipcRenderer.invoke('workspace:setActive', folderPath),
  workspacePickFolder: () => ipcRenderer.invoke('workspace:pickFolder'),
  workspaceEnsureInitialized: (folderPath: string) => ipcRenderer.invoke('workspace:ensureInitialized', folderPath),
  workspaceListDir: (relativePath?: string) => ipcRenderer.invoke('workspace:listDir', relativePath),
  workspaceReadFilePreview: (relativePath: string) => ipcRenderer.invoke('workspace:readFilePreview', relativePath),
  workspaceResolveAbsolutePath: (relativePath: string) => ipcRenderer.invoke('workspace:resolveAbsolutePath', relativePath),
  workspaceRevealInExplorer: (relativePath: string) => ipcRenderer.invoke('workspace:revealInExplorer', relativePath),
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
} as IElectronAPI);
