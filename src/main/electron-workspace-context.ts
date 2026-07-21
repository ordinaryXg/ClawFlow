import { BrowserWindow, WebContents } from 'electron';
import * as path from 'path';
import { getActiveWorkspaceRoot } from '../engine/core/active-workspace-root';
import { stickySatellitePathByWindowId } from './sticky-satellite-windows';
import { getMainShellLastWorkspacePath } from './shell/main-shell-workspace';
import * as workspaceService from './workspace/workspace-service';

function globalRootIsBoundToSomeSatellite(globalRoot: string): boolean {
  for (const p of stickySatellitePathByWindowId.values()) {
    if (workspaceService.isSameWorkspacePath(p, globalRoot)) return true;
  }
  return false;
}

/**
 * 当前 WebContents 所属窗口应对应的工作区根；无工作区时返回 `null`。
 * - 卫星窗口：绑定路径
 * - 主窗口：若全局 active 正被某卫星占用，则用主壳记忆路径
 */
export function resolveWorkspaceRootForWebContents(sender: WebContents): string | null {
  const win = BrowserWindow.fromWebContents(sender);
  if (win && !win.isDestroyed()) {
    const sat = stickySatellitePathByWindowId.get(win.id);
    if (sat) return path.resolve(sat);

    const globalRoot = getActiveWorkspaceRoot();
    if (globalRoot && globalRootIsBoundToSomeSatellite(globalRoot)) {
      const mainLast = getMainShellLastWorkspacePath();
      if (mainLast && !workspaceService.isSameWorkspacePath(mainLast, globalRoot)) {
        return path.resolve(mainLast);
      }
    }
  }
  return getActiveWorkspaceRoot();
}

export const NO_WORKSPACE_BOUND = 'NO_WORKSPACE_BOUND';

/** IPC 需要已绑定工作区时调用；未绑定时抛出 `NO_WORKSPACE_BOUND`。 */
export function requireWorkspaceRootForWebContents(sender: WebContents): string {
  const root = resolveWorkspaceRootForWebContents(sender);
  if (!root) {
    throw new Error(NO_WORKSPACE_BOUND);
  }
  return root;
}

/** 将 `null` 转为 `undefined`，供接受可选工作区根的 API 使用。 */
export function workspaceRootOrUndefined(root: string | null): string | undefined {
  return root ?? undefined;
}
