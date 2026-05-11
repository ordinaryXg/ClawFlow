// 全局类型声明
import type { SkillMarketFetchResult } from './skill-market-shared';

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
  workspaceGetDefaultPath: () => Promise<string>;
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
  workspacePickFolder: () => Promise<string | null>;
  workspaceEnsureInitialized: (
    folderPath: string,
    opts?: { tools?: import('./shared/workspace-tools').WorkspaceToolSelection }
  ) => Promise<{ meta: unknown }>;
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
}

declare global {
  interface Window {
    electronAPI: IElectronAPI;
  }
}

export {};
