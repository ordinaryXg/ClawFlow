/**
 * 工作区 / 智能档案 / Hermes 技能 / 记忆 FTS 等 IPC（在 app.whenReady 内调用）。
 */
import { BrowserWindow, ipcMain, shell, clipboard } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as workspaceService from '../workspace/workspace-service';
import { summarizeWorkspacesUnread } from '../workspace/workspace-unread-summary';
import * as workspaceExplorer from '../workspace/workspace-explorer';
import * as workspaceChangeLog from '../workspace/workspace-change-log';
import type { WorkspaceToolSelection } from '../../shared/workspace-tools';
import {
  requireWorkspaceRootForWebContents,
  resolveWorkspaceRootForWebContents,
} from '../electron-workspace-context';
import { stickySatellitePathByWindowId } from '../sticky-satellite-windows';
import { getMainShellLastWorkspacePath, setMainShellLastWorkspacePath } from '../shell/main-shell-workspace';
import {
  applyActiveWorkspace,
  clearActiveWorkspaceRootInMemory,
  syncActiveWorkspaceRootToEngine,
} from '../workspace/active-workspace-sync';
import { rescheduleAllTodoTriggers } from '../todo/todo-triggers-scheduler';
import { evictClawFlowSessionStore } from '../../engine/clawflow-engine';
import { rebuildHermesSkillFtsIndex, searchHermesMemory } from '../../engine/hermes-memory-db';
import { listKnowledgeManifestEntries, rebuildKnowledgeManifest } from '../workspace/workspace-knowledge-manifest';
import { createKnowledgeNote } from '../workspace/workspace-knowledge-bootstrap';
import { ingestWorkspaceFileToKnowledge } from '../workspace/workspace-knowledge-ingest';
import {
  readHermesEmbeddingPrefsFile,
  writeHermesEmbeddingPrefsFile,
  type HermesEmbeddingPrefsStored,
} from '../prefs/hermes-embedding-prefs';
import { listWorkspaceHermesSkills, readWorkspaceSkillTextFile } from '../workspace/workspace-skills-read';
import { readDisabledSkillRootsSync, setSkillRootEnabled } from '../workspace/workspace-skills-ui-state';
import { deleteHermesSkillDirectory } from '../workspace/workspace-skills-delete';
import { syncWorkspaceSkillManifest } from '../workspace/workspace-skill-manifest';
import { gitCloneWorkspace, gitPullWorkspace, gitPushWorkspace } from '../workspace/workspace-git';
import { readSkillEvolutionState } from '../skill/skill-evolution-state';
import { runManualSkillEvolutionTest } from '../skill/skill-evolution-scheduler';
import {
  getEvolutionRun,
  listEvolutionRuns,
  revertEvolutionRun,
} from '../skill/skill-evolution-runs';
import { intelligenceLevelFromXp, intelligenceLevelProgress } from '../../shared/intelligence-profile';

export function registerWorkspaceIPC(): void {

  ipcMain.handle('workspace:getActive', async () => {
    const reg = workspaceService.loadRegistry();
    const raw = reg.activeWorkspacePath?.trim();
    if (!raw) return { path: null, meta: null };
    const root = path.resolve(raw);
    const meta = workspaceService.readWorkspaceMetaSync(root);
    return { path: root, meta };
  });

  ipcMain.handle('intelligence:getProfile', async (event) => {
    const root = resolveWorkspaceRootForWebContents(event.sender);
    if (!root || !String(root).trim()) {
      return { ok: false as const, error: 'no_workspace' };
    }
    try {
      const s = await readSkillEvolutionState(root);
      const xp = s.intelligenceXp;
      const level = intelligenceLevelFromXp(xp);
      const prog = intelligenceLevelProgress(xp);
      return {
        ok: true as const,
        xp,
        level,
        progress01: prog.progress01,
        xpIntoLevel: prog.xpIntoLevel,
        xpForNext: prog.xpForNext,
        totalUserManualRounds: s.totalUserManualRounds,
        lastEvolutionAtMs: s.lastEvolutionAtMs,
      };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return { ok: false as const, error: msg };
    }
  });

  ipcMain.handle('intelligence:triggerEvolutionTest', async (event, payload: unknown) => {
    const root = resolveWorkspaceRootForWebContents(event.sender);
    if (!root || !String(root).trim()) {
      return { ok: false as const, error: 'no_workspace' };
    }
    const p = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
    const conversationId = typeof p.conversationId === 'string' ? p.conversationId.trim() : undefined;
    try {
      return await runManualSkillEvolutionTest({ workspaceRoot: root, mainConversationId: conversationId });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return { ok: false as const, error: msg };
    }
  });

  ipcMain.handle('evolution:listRuns', async (event, limit?: number) => {
    const root = requireWorkspaceRootForWebContents(event.sender);
    const lim = typeof limit === 'number' && Number.isFinite(limit) ? limit : 24;
    const runs = await listEvolutionRuns(root, lim);
    return { ok: true as const, runs };
  });

  ipcMain.handle('evolution:getRun', async (event, runId: string) => {
    const root = requireWorkspaceRootForWebContents(event.sender);
    const run = await getEvolutionRun(root, String(runId ?? '').trim());
    if (!run) return { ok: false as const, error: 'run_not_found' };
    return { ok: true as const, run };
  });

  ipcMain.handle('evolution:revertRun', async (event, runId: string) => {
    const root = requireWorkspaceRootForWebContents(event.sender);
    const res = await revertEvolutionRun(root, String(runId ?? '').trim());
    if (!res.ok) return res;
    void workspaceChangeLog
      .appendWorkspaceChangeLog(root, {
        kind: 'evolution',
        title: '已撤销进化',
        userPreview: `runId: ${String(runId ?? '').trim()}`,
        assistantExcerpt: '工作区记忆/技能/角色文档已恢复至该次进化前的备份。',
        meta: { evolutionReverted: true, evolutionRunId: String(runId ?? '').trim() },
      })
      .catch(() => undefined);
    return { ok: true as const };
  });

  ipcMain.handle('workspace:listRecent', async () => {
    return workspaceService.listRecentWorkspaceEntries();
  });

  ipcMain.handle('workspace:listUnreadSummaries', async (_e, payload: unknown) => {
    const paths =
      payload && typeof payload === 'object' && Array.isArray((payload as { paths?: unknown }).paths)
        ? (payload as { paths: unknown[] }).paths.map((x) => String(x ?? '').trim()).filter(Boolean)
        : [];
    const summaries = await summarizeWorkspacesUnread(paths);
    return { summaries };
  });

  ipcMain.handle('workspace:remove', async (_event, folderPath: string) => {
    const removedResolved = path.resolve(String(folderPath || ''));
    const res = await workspaceService.removeWorkspaceForUser(removedResolved);
    if (!res.ok) return res;

    evictClawFlowSessionStore(removedResolved);

    const mainLast = getMainShellLastWorkspacePath();
    if (mainLast && workspaceService.isSameWorkspacePath(mainLast, removedResolved)) {
      setMainShellLastWorkspacePath(res.newActivePath);
    }

    if (res.newActivePath) {
      syncActiveWorkspaceRootToEngine(res.newActivePath);
      await workspaceService.ensureWorkspaceInitialized(res.newActivePath);
    } else {
      clearActiveWorkspaceRootInMemory();
    }
    BrowserWindow.getAllWindows().forEach((w) =>
      w.webContents.send('workspace:changed', { path: res.newActivePath })
    );
    return res;
  });

  ipcMain.handle('workspace:setActive', async (_event, nextPath: string, opts?: { fromMainShell?: boolean }) => {
    const resolved = path.resolve(String(nextPath || ''));
    if (opts?.fromMainShell !== false) {
      setMainShellLastWorkspacePath(resolved);
    }
    applyActiveWorkspace(resolved);
    BrowserWindow.getAllWindows().forEach((w) => w.webContents.send('workspace:changed', { path: resolved }));
    // 等待初始化完成（含根目录角色模板），避免 UI 已切换但文件尚未写入
    try {
      await workspaceService.ensureWorkspaceInitialized(resolved);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn('[workspace] ensureWorkspaceInitialized failed:', msg);
    }
    try {
      rescheduleAllTodoTriggers();
    } catch {
      /* ignore */
    }
    return { success: true, path: resolved };
  });

  /** 拖入文件夹到「+」：校验为目录后初始化并切为当前工作区 */
  ipcMain.handle('workspace:addFromAbsolutePath', async (event, absPath: string) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win && stickySatellitePathByWindowId.has(win.id)) {
      return { ok: false as const, error: 'satellite_no_add_workspace' };
    }
    const resolved = path.resolve(String(absPath || ''));
    let st: fs.Stats | null;
    try {
      st = await fs.promises.stat(resolved);
    } catch {
      return { ok: false as const, error: 'not_found' };
    }
    if (!st.isDirectory()) {
      return { ok: false as const, error: 'not_directory' };
    }
    try {
      await workspaceService.ensureWorkspaceInitialized(resolved);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return { ok: false as const, error: msg };
    }
    applyActiveWorkspace(resolved);
    BrowserWindow.getAllWindows().forEach((w) => w.webContents.send('workspace:changed', { path: resolved }));
    return { ok: true as const, path: resolved };
  });

  ipcMain.handle('workspace:pickFolder', async (event, opts?: { title?: string }) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win && stickySatellitePathByWindowId.has(win.id)) {
      return null;
    }
    const title = opts && typeof opts.title === 'string' ? opts.title : undefined;
    return await workspaceService.pickWorkspaceFolder(win, title);
  });

  ipcMain.handle(
    'workspace:ensureInitialized',
    async (_e, folderPath: string, opts?: { tools?: WorkspaceToolSelection; gitRemoteUrl?: string | null }) => {
      const meta = await workspaceService.ensureWorkspaceInitialized(String(folderPath || ''), opts);
      return { meta };
    }
  );

  ipcMain.handle(
    'workspace:gitClone',
    async (event, payload: unknown) => {
      const win = BrowserWindow.fromWebContents(event.sender);
      if (win && stickySatellitePathByWindowId.has(win.id)) {
        return { ok: false as const, error: 'satellite_no_git_clone' };
      }
      const o = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
      const remoteUrl = typeof o.remoteUrl === 'string' ? o.remoteUrl.trim() : '';
      const parentDir = typeof o.parentDir === 'string' ? o.parentDir.trim() : '';
      if (!remoteUrl || !parentDir) return { ok: false as const, error: 'missing_fields' };
      return gitCloneWorkspace(remoteUrl, parentDir);
    }
  );

  ipcMain.handle('workspace:gitPull', async (_event, folderPath: string) => {
    const fp = path.resolve(String(folderPath || ''));
    if (!workspaceService.isWorkspacePathRegistered(fp)) {
      return { ok: false as const, error: 'not_registered' };
    }
    const meta = workspaceService.readWorkspaceMetaSync(fp);
    if (!meta?.gitRemoteUrl?.trim()) {
      return { ok: false as const, error: 'not_git_workspace' };
    }
    return gitPullWorkspace(fp);
  });

  ipcMain.handle('workspace:gitPush', async (_event, folderPath: string) => {
    const fp = path.resolve(String(folderPath || ''));
    if (!workspaceService.isWorkspacePathRegistered(fp)) {
      return { ok: false as const, error: 'not_registered' };
    }
    const meta = workspaceService.readWorkspaceMetaSync(fp);
    if (!meta?.gitRemoteUrl?.trim()) {
      return { ok: false as const, error: 'not_git_workspace' };
    }
    return gitPushWorkspace(fp);
  });

  ipcMain.handle('workspace:resetCache', async (event, folderPath: string) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win && stickySatellitePathByWindowId.has(win.id)) {
      return { ok: false as const, error: 'satellite_no_reset_cache' };
    }
    const fp = path.resolve(String(folderPath || ''));
    if (!workspaceService.isWorkspacePathRegistered(fp)) {
      return { ok: false as const, error: 'not_registered' };
    }
    const res = await workspaceService.resetWorkspaceCacheDirs(fp);
    if (!res.ok) return res;
    try {
      await workspaceService.ensureWorkspaceInitialized(fp);
    } catch {
      /* allow empty; user may want truly clean until next open */
    }
    return res;
  });

  ipcMain.handle('workspace:getToolSelection', async (_e, folderPath: string) => {
    try {
      const tools = await workspaceService.readWorkspaceToolManifest(String(folderPath || ''));
      return { ok: true as const, tools };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return { ok: false as const, error: msg };
    }
  });

  ipcMain.handle('workspace:setToolSelection', async (_e, folderPath: string, tools: WorkspaceToolSelection) => {
    try {
      await workspaceService.writeWorkspaceToolSelection(String(folderPath || ''), tools ?? {});
      return { ok: true as const };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return { ok: false as const, error: msg };
    }
  });

  ipcMain.handle('workspace:listDir', async (event, relativePath?: string) => {
    const root = requireWorkspaceRootForWebContents(event.sender);
    try {
      const entries = await workspaceExplorer.listWorkspaceDirectory(root, String(relativePath ?? ''));
      return { ok: true as const, entries };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return { ok: false as const, error: msg, entries: [] as Array<{ name: string; kind: 'file' | 'dir' }> };
    }
  });

  ipcMain.handle('workspace:readFilePreview', async (event, relativePath: string) => {
    const root = requireWorkspaceRootForWebContents(event.sender);
    return await workspaceExplorer.readWorkspaceFilePreview(root, String(relativePath ?? ''));
  });

  const resolveAbs = (root: string, rel: string) => workspaceExplorer.resolvePathInsideWorkspace(root, String(rel ?? ''));

  ipcMain.handle('workspace:resolveAbsolutePath', async (event, relativePath: string) => {
    const root = requireWorkspaceRootForWebContents(event.sender);
    const rel = String(relativePath ?? '');
    const abs = resolveAbs(root, rel);
    return { ok: true as const, workspaceRoot: root, relativePath: rel, absolutePath: abs };
  });

  ipcMain.handle('workspace:revealInExplorer', async (event, relativePath: string) => {
    const root = requireWorkspaceRootForWebContents(event.sender);
    const rel = String(relativePath ?? '');
    const abs = resolveAbs(root, rel);
    try {
      shell.showItemInFolder(abs);
      return { ok: true as const };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return { ok: false as const, error: msg };
    }
  });

  ipcMain.handle('clipboard:writeText', async (_e, text: string) => {
    try {
      clipboard.writeText(String(text ?? ''));
      return { ok: true as const };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return { ok: false as const, error: msg };
    }
  });

  ipcMain.handle('workspace:mkdir', async (event, params: { relativePath: string }) => {
    const root = requireWorkspaceRootForWebContents(event.sender);
    const rel = String(params?.relativePath ?? '');
    const abs = resolveAbs(root, rel);
    try {
      await fs.promises.mkdir(abs, { recursive: true });
      void workspaceChangeLog
        .appendWorkspaceChangeLog(root, {
          kind: 'file_change',
          title: `新建目录：${rel}`,
          userPreview: rel,
          assistantExcerpt: '操作：mkdir（recursive）',
          meta: { op: 'mkdir', relativePath: rel },
        })
        .catch(() => undefined);
      return { ok: true as const };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return { ok: false as const, error: msg };
    }
  });

  ipcMain.handle(
    'workspace:writeTextFile',
    async (event, params: { relativePath: string; content?: string; overwrite?: boolean }) => {
      const root = requireWorkspaceRootForWebContents(event.sender);
      const rel = String(params?.relativePath ?? '');
      const abs = resolveAbs(root, rel);
      const content = String(params?.content ?? '');
      const overwrite = params?.overwrite !== false;
      try {
        await fs.promises.mkdir(path.dirname(abs), { recursive: true });
        const exists = await fs.promises
          .stat(abs)
          .then((s) => s.isFile() || s.isSymbolicLink())
          .catch(() => false);
        if (exists && !overwrite) return { ok: false as const, error: 'File exists (overwrite=false)' };
        await fs.promises.writeFile(abs, content, 'utf8');
        void workspaceChangeLog
          .appendWorkspaceChangeLog(root, {
            kind: 'file_change',
            title: `${exists ? '文件更新' : '文件创建'}：${rel}`,
            userPreview: rel,
            assistantExcerpt: `操作：write_text · overwrite=${overwrite} · 约 ${Buffer.byteLength(content, 'utf8')} 字节`,
            meta: { op: 'write_text', relativePath: rel, existed: exists },
          })
          .catch(() => undefined);
        return { ok: true as const };
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return { ok: false as const, error: msg };
      }
    }
  );

  ipcMain.handle('workspace:renamePath', async (event, params: { from: string; to: string; overwrite?: boolean }) => {
    const root = requireWorkspaceRootForWebContents(event.sender);
    const fromRel = String(params?.from ?? '');
    const toRel = String(params?.to ?? '');
    const overwrite = params?.overwrite === true;
    const fromAbs = resolveAbs(root, fromRel);
    const toAbs = resolveAbs(root, toRel);
    try {
      await fs.promises.mkdir(path.dirname(toAbs), { recursive: true });
      const toExists = await fs.promises
        .stat(toAbs)
        .then(() => true)
        .catch(() => false);
      if (toExists && !overwrite) return { ok: false as const, error: 'Destination exists (overwrite=false)' };
      if (toExists && overwrite) await fs.promises.rm(toAbs, { recursive: true, force: true });
      await fs.promises.rename(fromAbs, toAbs);
      void workspaceChangeLog
        .appendWorkspaceChangeLog(root, {
          kind: 'file_change',
          title: `重命名：${fromRel} → ${toRel}`,
          userPreview: `${fromRel}\n→\n${toRel}`,
          assistantExcerpt: `overwrite=${overwrite}`,
          meta: { op: 'rename', from: fromRel, to: toRel },
        })
        .catch(() => undefined);
      return { ok: true as const };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return { ok: false as const, error: msg };
    }
  });

  ipcMain.handle('workspace:deletePath', async (event, params: { relativePath: string }) => {
    const root = requireWorkspaceRootForWebContents(event.sender);
    const rel = String(params?.relativePath ?? '').trim();
    if (!rel) {
      return { ok: false as const, error: 'empty_path' };
    }
    let abs: string;
    try {
      abs = resolveAbs(root, rel);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return { ok: false as const, error: msg };
    }
    try {
      await fs.promises.rm(abs, { recursive: true, force: true });
      void workspaceChangeLog
        .appendWorkspaceChangeLog(root, {
          kind: 'file_change',
          title: `删除：${rel}`,
          userPreview: rel,
          assistantExcerpt: '操作：delete_path（recursive）',
          meta: { op: 'delete', relativePath: rel },
        })
        .catch(() => undefined);
      return { ok: true as const };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return { ok: false as const, error: msg };
    }
  });

  ipcMain.handle('workspace:getChangeLog', async (event, limit?: number) => {
    const root = requireWorkspaceRootForWebContents(event.sender);
    const lim = typeof limit === 'number' && Number.isFinite(limit) ? limit : 100;
    const entries = await workspaceChangeLog.getWorkspaceChangeLog(root, lim);
    return { ok: true as const, entries };
  });

  ipcMain.handle(
    'workspace:appendChangeLog',
    async (event, payload: { conversationId: string; userPreview: string; assistantExcerpt: string }) => {
      const root = requireWorkspaceRootForWebContents(event.sender);
      try {
        const entry = await workspaceChangeLog.appendWorkspaceChangeLog(root, {
          conversationId: String(payload?.conversationId ?? ''),
          userPreview: String(payload?.userPreview ?? ''),
          assistantExcerpt: String(payload?.assistantExcerpt ?? ''),
          kind: 'conversation_round',
        });
        return { ok: true as const, entry };
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return { ok: false as const, error: msg };
      }
    }
  );

  ipcMain.handle(
    'memoryFts:search',
    async (event, params: { query?: string; limit?: number; skillName?: string }) => {
      const root = resolveWorkspaceRootForWebContents(event.sender);
      if (!root) return { ok: false as const, error: 'no_workspace' };
      const query = String(params?.query ?? '').trim();
      if (!query) return { ok: false as const, error: 'missing query' };
      const res = await searchHermesMemory(root, {
        query,
        limit: params?.limit,
        skillName: params?.skillName != null ? String(params.skillName).trim() || undefined : undefined,
      });
      if (!res.ok) return { ok: false as const, error: res.error };
      return { ok: true as const, hits: res.hits };
    }
  );

  ipcMain.handle('memoryFts:rebuild', async (event) => {
    const root = resolveWorkspaceRootForWebContents(event.sender);
    if (!root) return { ok: false as const, error: 'no_workspace' };
    const res = await rebuildHermesSkillFtsIndex(root);
    if (!res.ok) return { ok: false as const, error: res.error };
    return { ok: true as const, indexed: res.indexed, pruned: res.pruned };
  });

  ipcMain.handle('knowledge:listManifest', async (event, opts?: { refresh?: boolean }) => {
    const root = resolveWorkspaceRootForWebContents(event.sender);
    if (!root) return { ok: false as const, error: 'no_workspace' };
    try {
      const entries = opts?.refresh
        ? rebuildKnowledgeManifest(root).entries
        : listKnowledgeManifestEntries(root);
      return { ok: true as const, entries };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return { ok: false as const, error: msg };
    }
  });

  ipcMain.handle(
    'knowledge:createNote',
    async (event, params?: { title?: string; subdir?: 'notes' | 'docs' }) => {
      const root = requireWorkspaceRootForWebContents(event.sender);
      const res = await createKnowledgeNote(root, {
        title: params?.title,
        subdir: params?.subdir === 'docs' ? 'docs' : 'notes',
      });
      if (!res.ok) return res;
      return { ok: true as const, relativePath: res.relativePath };
    }
  );

  ipcMain.handle('knowledge:ingestFile', async (event, relativePath: string) => {
    const root = requireWorkspaceRootForWebContents(event.sender);
    const res = await ingestWorkspaceFileToKnowledge(root, String(relativePath ?? ''));
    return res;
  });

  ipcMain.handle('hermes:getEmbeddingPrefs', async () => {
    return { ok: true as const, prefs: readHermesEmbeddingPrefsFile() ?? {} };
  });

  ipcMain.handle('hermes:saveEmbeddingPrefs', async (_e, prefs: HermesEmbeddingPrefsStored) => {
    try {
      writeHermesEmbeddingPrefsFile(prefs ?? {});
      return { ok: true as const };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false as const, error: msg };
    }
  });

  ipcMain.handle('workspaceSkills:list', async (event) => {
    const root = requireWorkspaceRootForWebContents(event.sender);
    try {
      await syncWorkspaceSkillManifest(root).catch(() => undefined);
      const disabled = readDisabledSkillRootsSync(root);
      const skills = listWorkspaceHermesSkills(root).map((s) => ({
        ...s,
        enabled: !disabled.has(s.skillRootRel.replace(/\\/g, '/')),
      }));
      return { ok: true as const, skills };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return { ok: false as const, error: msg, skills: [] };
    }
  });

  ipcMain.handle('workspaceSkills:setEnabled', async (event, payload: unknown) => {
    const root = requireWorkspaceRootForWebContents(event.sender);
    const o = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
    const skillRootRel = typeof o.skillRootRel === 'string' ? o.skillRootRel.trim() : '';
    const enabled = o.enabled === true;
    if (!skillRootRel) return { ok: false as const, error: 'missing skillRootRel' };
    try {
      await setSkillRootEnabled(root, skillRootRel, enabled);
      await syncWorkspaceSkillManifest(root).catch(() => undefined);
      void workspaceChangeLog
        .appendWorkspaceChangeLog(root, {
          kind: enabled ? 'skill_enabled' : 'skill_disabled',
          title: `${enabled ? '技能启用' : '技能禁用'}：${skillRootRel}`,
          userPreview: skillRootRel,
          assistantExcerpt: enabled ? '该技能将参与 Hermes 列举与相关能力。' : '该技能已从启用列表排除（数据仍在工作区内）。',
          meta: { skillRootRel, enabled },
        })
        .catch(() => undefined);
      return { ok: true as const };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return { ok: false as const, error: msg };
    }
  });

  ipcMain.handle('workspaceSkills:deleteSkill', async (event, payload: unknown) => {
    const root = requireWorkspaceRootForWebContents(event.sender);
    const o = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
    const skillRootRel = typeof o.skillRootRel === 'string' ? o.skillRootRel.trim() : '';
    if (!skillRootRel) return { ok: false as const, error: 'missing skillRootRel' };
    const r = await deleteHermesSkillDirectory(root, skillRootRel);
    if (!r.ok) return { ok: false as const, error: r.error };
    try {
      await setSkillRootEnabled(root, skillRootRel, true);
    } catch {
      /* ignore */
    }
    await syncWorkspaceSkillManifest(root).catch(() => undefined);
    void workspaceChangeLog
      .appendWorkspaceChangeLog(root, {
        kind: 'skill_deleted',
        title: `技能删除：${skillRootRel}`,
        userPreview: skillRootRel,
        assistantExcerpt: '已从工作区移除 Hermes 技能目录。',
        meta: { skillRootRel },
      })
      .catch(() => undefined);
    return { ok: true as const };
  });

  ipcMain.handle('workspaceSkills:readFile', async (event, relativePath: string) => {
    const root = requireWorkspaceRootForWebContents(event.sender);
    const rel = String(relativePath ?? '').trim();
    if (!rel) return { ok: false as const, error: 'missing path' };
    const r = readWorkspaceSkillTextFile(root, rel);
    if (!r.ok) return { ok: false as const, error: r.error };
    return { ok: true as const, content: r.content };
  });
}
