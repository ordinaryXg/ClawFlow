// 全局类型声明
export interface IElectronAPI {
  getVersion: () => Promise<string>;
  getGatewayStatus: () => Promise<string>;
  startGateway: () => Promise<void>;
  stopGateway: () => Promise<void>;
  validateCLI: () => Promise<boolean>;
  getConfig: () => Promise<any>;
  updateConfig: (config: any) => Promise<{ success: boolean }>;
  pickCliPath: () => Promise<string | null>;
  getAppVersion: () => Promise<string>;
  setAppLanguage: (lang: 'zh' | 'en') => Promise<{ success: boolean }>;
  setModelAuthToken: (params: { provider: string; token: string; profileId?: string; label?: string }) => Promise<{ success: boolean }>;
  removeModelAuthToken: (params: { provider: string; profileId?: string }) => Promise<{ removed: boolean }>;
  setDefaultModel: (params: { modelId: string }) => Promise<{ success: boolean }>;
  getModels: () => Promise<any>;
  // 对话相关
  sendMessage: (message: string, sessionId?: string, modelId?: string) => Promise<any>;
  getConversations: () => Promise<any>;
  deleteConversation: (conversationId: string) => Promise<{ success: boolean }>;
  upsertConversation: (conversation: any) => Promise<{ success: boolean }>;
  // 技能管理
  getSkills: () => Promise<any>;
  installSkill: (skillName: string) => Promise<{ success: boolean }>;
  uninstallSkill: (skillName: string) => Promise<{ success: boolean }>;
  enableSkill: (skillName: string) => Promise<{ success: boolean }>;
  disableSkill: (skillName: string) => Promise<{ success: boolean }>;
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
  onWorkspaceChanged: (cb: (payload: { path: string }) => void) => () => void;
}

declare global {
  interface Window {
    electronAPI: IElectronAPI;
  }
}

export {};
