import { contextBridge, ipcRenderer } from 'electron';

// 暴露给渲染进程的 API 类型声明
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

// 通过 contextBridge 安全地暴露 API
contextBridge.exposeInMainWorld('electronAPI', {
  getVersion: () => ipcRenderer.invoke('openclaw:getVersion'),
  getGatewayStatus: () => ipcRenderer.invoke('openclaw:getGatewayStatus'),
  startGateway: () => ipcRenderer.invoke('openclaw:startGateway'),
  stopGateway: () => ipcRenderer.invoke('openclaw:stopGateway'),
  validateCLI: () => ipcRenderer.invoke('openclaw:validateCLI'),
  getConfig: () => ipcRenderer.invoke('openclaw:getConfig'),
  updateConfig: (config: any) => ipcRenderer.invoke('openclaw:updateConfig', config),
  // 对话相关
  sendMessage: (message: string) => ipcRenderer.invoke('openclaw:sendMessage', message),
  getConversations: () => ipcRenderer.invoke('openclaw:getConversations'),
  deleteConversation: (conversationId: string) => ipcRenderer.invoke('openclaw:deleteConversation', conversationId),
  // 技能管理
  getSkills: () => ipcRenderer.invoke('openclaw:getSkills'),
  installSkill: (skillName: string) => ipcRenderer.invoke('openclaw:installSkill', skillName),
  uninstallSkill: (skillName: string) => ipcRenderer.invoke('openclaw:uninstallSkill', skillName),
  enableSkill: (skillName: string) => ipcRenderer.invoke('openclaw:enableSkill', skillName),
  disableSkill: (skillName: string) => ipcRenderer.invoke('openclaw:disableSkill', skillName),
  // 连接器管理
  getConnectors: () => ipcRenderer.invoke('openclaw:getConnectors'),
  addConnector: (config: any) => ipcRenderer.invoke('openclaw:addConnector', config),
  updateConnector: (id: string, config: any) => ipcRenderer.invoke('openclaw:updateConnector', id, config),
  deleteConnector: (id: string) => ipcRenderer.invoke('openclaw:deleteConnector', id),
  testConnector: (id: string) => ipcRenderer.invoke('openclaw:testConnector', id),
} as IElectronAPI);
