// 全局类型声明
export interface IElectronAPI {
  getVersion: () => Promise<string>;
  getGatewayStatus: () => Promise<string>;
  startGateway: () => Promise<void>;
  stopGateway: () => Promise<void>;
  validateCLI: () => Promise<boolean>;
  getConfig: () => Promise<any>;
  updateConfig: (config: any) => Promise<{ success: boolean }>;
  // 对话相关
  sendMessage: (message: string) => Promise<any>;
  getConversations: () => Promise<any>;
  deleteConversation: (conversationId: string) => Promise<{ success: boolean }>;
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
}

declare global {
  interface Window {
    electronAPI: IElectronAPI;
  }
}

export {};
