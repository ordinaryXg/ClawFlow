import * as fs from 'fs';
import * as path from 'path';
import { broadcastWorkspaceFilesUpdated } from './workspace-files-broadcast';

let watchHandle: fs.FSWatcher | null = null;
let watchedRoot = '';
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleBroadcast(root: string): void {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    broadcastWorkspaceFilesUpdated(root);
  }, 150);
}

/** 监听活动工作区根目录变更（递归，平台支持时）；用于外部写盘、进化等未走 IPC 的场景。 */
export function setWorkspaceFilesWatchRoot(workspaceRoot: string | null): void {
  if (watchHandle) {
    watchHandle.close();
    watchHandle = null;
  }
  watchedRoot = '';
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  const root = workspaceRoot ? path.resolve(workspaceRoot) : '';
  if (!root) return;
  try {
    watchedRoot = root;
    watchHandle = fs.watch(root, { recursive: true }, () => {
      if (!watchedRoot) return;
      scheduleBroadcast(watchedRoot);
    });
    watchHandle.on('error', () => {
      watchHandle?.close();
      watchHandle = null;
      watchedRoot = '';
    });
  } catch {
    watchedRoot = '';
  }
}
