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
} as IElectronAPI);
