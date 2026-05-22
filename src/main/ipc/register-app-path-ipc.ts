import * as path from 'path';
import * as fs from 'fs';
import { shell } from 'electron';
import { isOpenExternalAllowedUrl } from '../shell-external-link-policy';
import { getLauncherIconDataUrl } from '../shell/launcher-icon-main';
import { setDesktopEntryHidden, sweepLauncherStashForWorkspace } from '../shell/desktop-pin-hide-main';
import { replaceIpcHandler } from './ipc-handler-utils';

/** 打开绝对路径 / 系统图标 / 桌面钉：模块加载时注册 */
export function registerAppPathAndIconIPC(): void {
  replaceIpcHandler('app:openPath', async (_e, absolutePath: string) => {
    const raw = String(absolutePath ?? '').trim();
    if (!raw || !path.isAbsolute(raw)) {
      return { ok: false as const, error: 'invalid_path' };
    }
    try {
      const st = await fs.promises.stat(raw);
      if (st.isFile() || st.isSymbolicLink()) {
        /* ok */
      } else if (st.isDirectory() && raw.toLowerCase().endsWith('.app')) {
        /* macOS .app bundle */
      } else {
        return { ok: false as const, error: 'unsupported' };
      }
    } catch {
      return { ok: false as const, error: 'not_found' };
    }
    try {
      const err = await shell.openPath(raw);
      if (err) return { ok: false as const, error: err };
      return { ok: true as const };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return { ok: false as const, error: msg };
    }
  });

  replaceIpcHandler('app:openExternal', async (_e, url: string) => {
    const raw = String(url ?? '').trim();
    if (!isOpenExternalAllowedUrl(raw)) {
      return { ok: false as const, error: 'invalid_url' as const };
    }
    try {
      await shell.openExternal(raw);
      return { ok: true as const };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return { ok: false as const, error: msg };
    }
  });

  replaceIpcHandler('app:getFileIconDataUrl', async (_e, absolutePath: string) => getLauncherIconDataUrl(absolutePath));

  replaceIpcHandler(
    'app:setPathHidden',
    async (_e, payload: { absolutePath?: string; hidden?: boolean; workspacePath?: string }) => {
      const abs = String(payload?.absolutePath ?? '').trim();
      const hidden = Boolean(payload?.hidden);
      const ws = String(payload?.workspacePath ?? '').trim();
      return setDesktopEntryHidden(abs, hidden, ws || undefined);
    }
  );

  replaceIpcHandler('app:sweepLauncherStash', async (_e, payload: { workspacePath?: string }) => {
    const ws = String(payload?.workspacePath ?? '').trim();
    if (!ws) return { ok: false as const, error: 'workspace_required' as const };
    await sweepLauncherStashForWorkspace(ws);
    return { ok: true as const };
  });
}
