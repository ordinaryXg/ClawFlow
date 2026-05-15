/**
 * 主进程内「当前用于解析类逻辑的 workspace 根」单例。
 * 随用户切换工作区由 index / workspace IPC 更新；供 electron-workspace-context 等读取。
 */
import * as path from 'path';
import { getDefaultWorkspacePath } from '../main/workspace/workspace-service';

let activeWorkspaceRoot = path.resolve(getDefaultWorkspacePath());

export function setActiveWorkspaceRoot(root: string): void {
  const raw = String(root ?? '').trim();
  activeWorkspaceRoot = raw ? path.resolve(raw) : path.resolve(getDefaultWorkspacePath());
}

export function getActiveWorkspaceRoot(): string {
  return activeWorkspaceRoot;
}
