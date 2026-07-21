/**
 * 主进程内「当前用于解析类逻辑的 workspace 根」单例。
 * 无选中工作区时为 `null`；由 index / workspace IPC 在用户切换时更新。
 */
import * as path from 'path';

let activeWorkspaceRoot: string | null = null;

export function setActiveWorkspaceRoot(root: string): void {
  const raw = String(root ?? '').trim();
  activeWorkspaceRoot = raw ? path.resolve(raw) : null;
}

export function getActiveWorkspaceRoot(): string | null {
  return activeWorkspaceRoot;
}
