import * as path from 'path';
import * as fs from 'fs';
import * as workspaceExplorer from '../workspace/workspace-explorer';
import { requireWorkspaceRootForWebContents } from '../electron-workspace-context';
import { broadcastWorkspaceFilesUpdated } from '../workspace/workspace-files-broadcast';
import { replaceIpcHandler } from './ipc-handler-utils';

/** 外部拖入 / 聊天拖放 / 绝对路径 stat：须在 whenReady 前可用 */
export function registerWorkspaceEarlyIPC(): void {
  replaceIpcHandler(
    'workspace:importExternalPaths',
    async (
      event,
      params: { targetRelativeDir: string; sourceAbsolutePaths: string[]; overwrite?: boolean }
    ) => {
      const root = requireWorkspaceRootForWebContents(event.sender);
      try {
        const result = await workspaceExplorer.importExternalPathsIntoWorkspace(
          root,
          String(params?.targetRelativeDir ?? ''),
          Array.isArray(params?.sourceAbsolutePaths) ? params.sourceAbsolutePaths : [],
          { overwrite: params?.overwrite !== false }
        );
        if (result.ok) broadcastWorkspaceFilesUpdated(root);
        return result;
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return { ok: false as const, error: msg };
      }
    }
  );

  replaceIpcHandler('workspace:copyChatDropFiles', async (event, params: { sourceAbsolutePaths: string[] }) => {
    const root = requireWorkspaceRootForWebContents(event.sender);
    try {
      return await workspaceExplorer.copyExternalPathsToChatDropCache(
        root,
        Array.isArray(params?.sourceAbsolutePaths) ? params.sourceAbsolutePaths : []
      );
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return { ok: false as const, error: msg };
    }
  });

  replaceIpcHandler('workspace:statAbsolutePath', async (_e, absPath: string) => {
    const resolved = path.resolve(String(absPath || ''));
    try {
      const st = await fs.promises.stat(resolved);
      return { ok: true as const, path: resolved, isDirectory: st.isDirectory() };
    } catch {
      return { ok: false as const, error: 'not_found' as const };
    }
  });
}
