import { BrowserWindow, WebContents } from 'electron';
import * as path from 'path';
import { getActiveWorkspaceRoot } from '../engine/active-workspace-root';
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
 * 当前 WebContents 所属窗口应对应的工作区根：
 * - 卫星窗口：绑定路径
 * - 主窗口：若全局 active 正被某卫星占用，则用主壳记忆路径（避免主窗仍显示已拖出的工作区）
 */
export function resolveWorkspaceRootForWebContents(sender: WebContents): string {
  const win = BrowserWindow.fromWebContents(sender);
  if (win && !win.isDestroyed()) {
    const sat = stickySatellitePathByWindowId.get(win.id);
    if (sat) return path.resolve(sat);

    const globalRoot = getActiveWorkspaceRoot();
    if (globalRootIsBoundToSomeSatellite(globalRoot)) {
      const mainLast = getMainShellLastWorkspacePath();
      if (mainLast && !workspaceService.isSameWorkspacePath(mainLast, globalRoot)) {
        return path.resolve(mainLast);
      }
      const def = workspaceService.getDefaultWorkspacePath();
      if (!workspaceService.isSameWorkspacePath(def, globalRoot)) {
        return path.resolve(def);
      }
    }
  }
  return getActiveWorkspaceRoot();
}
