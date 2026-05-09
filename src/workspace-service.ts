/**
 * Workspace 目录与注册表（主进程）。
 * 每个 workspace 根目录下包含 `.clawflow/`。
 */

import { randomUUID } from 'crypto';
import { app, BrowserWindow, dialog, OpenDialogOptions } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { ensureWorkspaceAgentRoleTemplates } from './workspace-agent-bootstrap';

export const CLAWFLOW_DIR = '.clawflow';

export interface WorkspaceMeta {
  id: string;
  name: string;
  createdAt: number;
  lastOpened: number;
}

export interface WorkspaceRegistry {
  activeWorkspacePath: string | null;
  recentWorkspacePaths: string[];
  /** 兼容迁移标记：旧版本会把 active 置顶到 recent[0] */
  unpinActiveMigrated?: boolean;
}

const REGISTRY_FILENAME = 'cf.workspace.v1.json';

export function getRegistryPath(): string {
  return path.join(app.getPath('userData'), REGISTRY_FILENAME);
}

/** 默认 workspace：位于 userData 下的固定文件夹（兼容旧版全局对话路径迁移）。 */
export function getDefaultWorkspacePath(): string {
  return path.join(app.getPath('userData'), 'Default Workspace');
}

/** 比较两个 workspace 根路径是否相同（Windows 忽略大小写）。 */
export function isSameWorkspacePath(a: string, b: string): boolean {
  const ra = path.resolve(a);
  const rb = path.resolve(b);
  if (process.platform === 'win32') return ra.toLowerCase() === rb.toLowerCase();
  return ra === rb;
}

export function clawflowDir(workspaceRoot: string): string {
  return path.join(workspaceRoot, CLAWFLOW_DIR);
}

export function workspaceMetaPath(workspaceRoot: string): string {
  return path.join(clawflowDir(workspaceRoot), 'workspace.json');
}

export function conversationsStorePath(workspaceRoot: string): string {
  return path.join(clawflowDir(workspaceRoot), 'conversations.json');
}

export function openclawStateDir(workspaceRoot: string): string {
  return path.join(clawflowDir(workspaceRoot), 'openclaw');
}

export function openclawConfigPath(workspaceRoot: string): string {
  return path.join(openclawStateDir(workspaceRoot), 'openclaw.json');
}

/** 应用级共享：模型鉴权与 OpenClaw 状态（不随工作区切换变化） */
export function globalClawflowRoot(): string {
  return path.join(app.getPath('userData'), CLAWFLOW_DIR);
}

export function globalOpenclawStateDir(): string {
  return path.join(globalClawflowRoot(), 'openclaw');
}

export function globalOpenclawConfigPath(): string {
  return path.join(globalOpenclawStateDir(), 'openclaw.json');
}

/** 注册表里出现过的 workspace 根路径（活跃、最近、默认），用于迁移与清理。 */
export function registeredWorkspaceRootCandidates(reg?: WorkspaceRegistry): string[] {
  const r = reg ?? loadRegistry();
  const candidates: string[] = [];
  if (r.activeWorkspacePath) candidates.push(r.activeWorkspacePath);
  for (const p of r.recentWorkspacePaths ?? []) candidates.push(p);
  candidates.push(getDefaultWorkspacePath());
  return Array.from(new Set(candidates.map((x) => path.resolve(String(x).trim())).filter(Boolean)));
}

function authProfilesPathUnderOpenclawState(stateRoot: string): string {
  return path.join(stateRoot, 'agents', 'main', 'agent', 'auth-profiles.json');
}

function readAuthProfilesPayload(filePath: string): { version: number; profiles: Record<string, unknown> } | null {
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const j = JSON.parse(raw) as { version?: unknown; profiles?: unknown };
    if (!j || typeof j !== 'object') return null;
    const profiles =
      j.profiles && typeof j.profiles === 'object' && !Array.isArray(j.profiles)
        ? (j.profiles as Record<string, unknown>)
        : {};
    const version = typeof j.version === 'number' ? j.version : 1;
    return { version, profiles };
  } catch {
    return null;
  }
}

function countAuthProfiles(filePath: string): number {
  const p = readAuthProfilesPayload(filePath);
  return p ? Object.keys(p.profiles).length : 0;
}

/**
 * 将历史上保存在「各工作区/.clawflow/openclaw」下的鉴权合并到全局目录（仅当全局尚无 profile 时执行）。
 * 在创建任意 OpenClaw 引擎之前调用一次即可。
 */
export function migrateWorkspaceOpenclawToGlobalOnce(): void {
  const destRoot = globalOpenclawStateDir();
  fs.mkdirSync(destRoot, { recursive: true });

  const destAuth = authProfilesPathUnderOpenclawState(destRoot);
  if (fs.existsSync(destAuth) && countAuthProfiles(destAuth) > 0) {
    migrateOpenclawJsonIfMissing(destRoot);
    return;
  }

  const uniq = registeredWorkspaceRootCandidates();

  const mergedProfiles: Record<string, unknown> = {};
  let mergedVersion = 1;

  for (const ws of uniq) {
    const srcAuth = authProfilesPathUnderOpenclawState(openclawStateDir(ws));
    if (!fs.existsSync(srcAuth)) continue;
    const payload = readAuthProfilesPayload(srcAuth);
    if (!payload || Object.keys(payload.profiles).length === 0) continue;
    Object.assign(mergedProfiles, payload.profiles);
    mergedVersion = payload.version;
  }

  if (Object.keys(mergedProfiles).length > 0) {
    const destAgentDir = path.dirname(destAuth);
    fs.mkdirSync(destAgentDir, { recursive: true });
    fs.writeFileSync(destAuth, JSON.stringify({ version: mergedVersion, profiles: mergedProfiles }, null, 2), 'utf-8');
  }

  migrateOpenclawJsonIfMissing(destRoot, uniq);
}

function migrateOpenclawJsonIfMissing(destRoot: string, workspaceCandidates?: string[]): void {
  const destCfg = path.join(destRoot, 'openclaw.json');
  if (fs.existsSync(destCfg)) return;
  const candidates = workspaceCandidates ?? registeredWorkspaceRootCandidates();
  for (const ws of candidates) {
    const srcCfg = openclawConfigPath(ws);
    if (!fs.existsSync(srcCfg)) continue;
    try {
      fs.copyFileSync(srcCfg, destCfg);
    } catch (e) {
      console.warn('[workspace-service] migrate openclaw.json failed:', e);
    }
    return;
  }
}

/**
 * 删除各工作区根下历史遗留的 `.clawflow/openclaw`（模型鉴权已迁至应用全局目录）。
 * 不会删除与用户数据全局目录相同的路径。
 */
export function removeLegacyWorkspaceOpenclawDirs(): void {
  const globalRoot = path.resolve(globalOpenclawStateDir());
  for (const ws of registeredWorkspaceRootCandidates()) {
    const legacy = path.resolve(path.join(clawflowDir(ws), 'openclaw'));
    if (legacy === globalRoot || !fs.existsSync(legacy)) continue;
    try {
      fs.rmSync(legacy, { recursive: true, force: true });
    } catch (e) {
      console.warn('[workspace-service] remove legacy workspace openclaw failed:', legacy, e);
    }
  }
}

export function legacyConversationsPath(): string {
  return path.join(app.getPath('userData'), 'cf.conversations.v1.json');
}

export function loadRegistry(): WorkspaceRegistry {
  const p = getRegistryPath();
  try {
    const raw = fs.readFileSync(p, 'utf-8');
    const j = JSON.parse(raw);
    const active =
      typeof j?.activeWorkspacePath === 'string' && j.activeWorkspacePath.trim()
        ? path.resolve(j.activeWorkspacePath.trim())
        : null;
    const rawList: unknown[] = Array.isArray(j?.recentWorkspacePaths) ? j.recentWorkspacePaths : [];
    const recentRaw = rawList.filter((x: unknown): x is string => typeof x === 'string' && Boolean(x.trim()));
    const recent = recentRaw.map((x) => path.resolve(x.trim()));
    let uniq = Array.from(new Set(recent)) as string[];
    const migratedFlag = Boolean(j?.unpinActiveMigrated);

    // 一次性迁移：旧逻辑会把 active 总是放到 recent[0]，导致“切换会置顶”的观感。
    // 这里把 active 从头部移到末尾（仅第一次），之后切换仅更新选中态不改顺序。
    if (!migratedFlag && active && uniq.length > 1 && path.resolve(uniq[0]) === path.resolve(active)) {
      uniq = [...uniq.slice(1), uniq[0]];
    }

    return { activeWorkspacePath: active, recentWorkspacePaths: uniq, unpinActiveMigrated: migratedFlag };
  } catch {
    return { activeWorkspacePath: null, recentWorkspacePaths: [], unpinActiveMigrated: true };
  }
}

export function saveRegistry(reg: WorkspaceRegistry): void {
  const p = getRegistryPath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const payload = JSON.stringify(
    {
      activeWorkspacePath: reg.activeWorkspacePath,
      recentWorkspacePaths: reg.recentWorkspacePaths.slice(0, 12),
      unpinActiveMigrated: reg.unpinActiveMigrated ?? true,
    },
    null,
    2
  );
  fs.writeFileSync(p, payload, 'utf-8');
}

function bumpRecent(reg: WorkspaceRegistry, workspacePath: string): WorkspaceRegistry {
  const abs = path.resolve(workspacePath);
  const list = (reg.recentWorkspacePaths ?? []).map((p) => path.resolve(p));
  const exists = list.some((p) => p === abs);
  // 关键：切换 workspace 不置顶（保持原顺序）。仅当首次出现时追加到末尾。
  const nextRecent = (exists ? list : [...list, abs]).slice(-12);
  return {
    activeWorkspacePath: abs,
    recentWorkspacePaths: nextRecent,
  };
}

/** 一次性：旧版 userData 全局 conversations → 当前 workspace 的 conversations.json */
export function migrateLegacyConversationsOnce(workspaceRoot: string): void {
  const target = conversationsStorePath(workspaceRoot);
  if (fs.existsSync(target)) return;
  const legacy = legacyConversationsPath();
  if (!fs.existsSync(legacy)) return;
  try {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(legacy, target);
    try {
      fs.renameSync(legacy, legacy + '.migrated');
    } catch {
      // ignore
    }
  } catch (e) {
    console.warn('[workspace-service] migrateLegacyConversationsOnce failed:', e);
  }
}

/**
 * 创建当前工作区 `.clawflow/` 与 `workspace.json`，并确保应用级全局 OpenClaw 状态目录存在。
 * 同时在**工作区根目录下的 `.roleAgent/`** 按需生成 agent 角色模板（AGENTS.md、SOUL.md 等，缺失才写入）。
 */
export async function ensureWorkspaceInitialized(workspaceRoot: string): Promise<WorkspaceMeta> {
  const root = path.resolve(workspaceRoot);
  const cf = clawflowDir(root);
  const metaPath = workspaceMetaPath(root);
  const ocDir = globalOpenclawStateDir();

  await fs.promises.mkdir(cf, { recursive: true });
  await fs.promises.mkdir(ocDir, { recursive: true });

  migrateLegacyConversationsOnce(root);

  try {
    const { created } = await ensureWorkspaceAgentRoleTemplates(root);
    if (created.length) {
      console.log('[workspace-service] agent role templates created:', created.join(', '));
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn('[workspace-service] ensureWorkspaceAgentRoleTemplates failed:', msg);
  }

  const now = Date.now();
  let meta: WorkspaceMeta;
  try {
    const buf = await fs.promises.readFile(metaPath, 'utf-8');
    const parsed = JSON.parse(buf);
    meta = {
      id: typeof parsed?.id === 'string' && parsed.id ? parsed.id : randomUUID(),
      name:
        typeof parsed?.name === 'string' && parsed.name.trim()
          ? parsed.name.trim()
          : path.basename(root),
      createdAt: typeof parsed?.createdAt === 'number' ? parsed.createdAt : now,
      lastOpened: now,
    };
  } catch {
    meta = {
      id: randomUUID(),
      name: path.basename(root),
      createdAt: now,
      lastOpened: now,
    };
  }
  meta.lastOpened = now;
  await fs.promises.writeFile(metaPath, JSON.stringify(meta, null, 2), 'utf-8');
  return meta;
}

export function setActiveWorkspace(workspacePath: string): WorkspaceRegistry {
  const reg = loadRegistry();
  const next = bumpRecent(reg, workspacePath);
  next.unpinActiveMigrated = true;
  saveRegistry(next);
  return next;
}

export function readWorkspaceMetaSync(workspaceRoot: string): WorkspaceMeta | null {
  try {
    const buf = fs.readFileSync(workspaceMetaPath(workspaceRoot), 'utf-8');
    const parsed = JSON.parse(buf);
    if (!parsed || typeof parsed !== 'object') return null;
    return {
      id: typeof parsed.id === 'string' ? parsed.id : '',
      name: typeof parsed.name === 'string' ? parsed.name : path.basename(workspaceRoot),
      createdAt: typeof parsed.createdAt === 'number' ? parsed.createdAt : 0,
      lastOpened: typeof parsed.lastOpened === 'number' ? parsed.lastOpened : 0,
    };
  } catch {
    return null;
  }
}

export async function pickWorkspaceFolder(senderWindow: BrowserWindow | null): Promise<string | null> {
  const opts: OpenDialogOptions = {
    title: '选择工作空间文件夹',
    properties: ['openDirectory', 'createDirectory'],
  };
  const res = senderWindow ? await dialog.showOpenDialog(senderWindow, opts) : await dialog.showOpenDialog(opts);
  if (res.canceled || res.filePaths.length === 0) return null;
  return path.resolve(res.filePaths[0]);
}

function isWorkspaceKnownInRegistry(abs: string, reg: WorkspaceRegistry): boolean {
  const recent = (reg.recentWorkspacePaths ?? []).map((p) => path.resolve(p));
  const active = reg.activeWorkspacePath ? path.resolve(reg.activeWorkspacePath) : null;
  return recent.some((p) => isSameWorkspacePath(p, abs)) || (active != null && isSameWorkspacePath(active, abs));
}

/**
 * 从注册表移除路径；若曾为 active 则切到最近一项或默认工作区。
 * 不删除磁盘。
 */
export function detachWorkspaceFromRegistry(workspacePath: string): { newActivePath: string } {
  const abs = path.resolve(workspacePath);
  const def = path.resolve(getDefaultWorkspacePath());
  const reg = loadRegistry();
  if (!isWorkspaceKnownInRegistry(abs, reg)) {
    throw new Error('Workspace is not in registry');
  }

  let recent = (reg.recentWorkspacePaths ?? []).map((p) => path.resolve(p));
  recent = recent.filter((p) => !isSameWorkspacePath(p, abs));

  const curActive = reg.activeWorkspacePath ? path.resolve(reg.activeWorkspacePath) : null;
  const wasActive = curActive != null && isSameWorkspacePath(curActive, abs);

  let newActive: string;
  if (wasActive) {
    newActive = recent.length > 0 ? recent[recent.length - 1] : def;
  } else {
    newActive = curActive ?? def;
  }

  if (!recent.some((p) => isSameWorkspacePath(p, newActive))) {
    recent = [...recent, newActive];
  }
  const uniq = Array.from(new Set(recent)).slice(-12);

  saveRegistry({
    activeWorkspacePath: newActive,
    recentWorkspacePaths: uniq,
    unpinActiveMigrated: true,
  });

  return { newActivePath: newActive };
}

export type RemoveWorkspaceUserResult =
  | { ok: true; newActivePath: string; deletedFromDisk: boolean }
  | { ok: false; error: string };

/**
 * 从最近列表移除；非「默认工作区」目录则递归删除该文件夹。
 */
export async function removeWorkspaceForUser(workspacePath: string): Promise<RemoveWorkspaceUserResult> {
  const abs = path.resolve(workspacePath);
  const def = path.resolve(getDefaultWorkspacePath());
  try {
    const { newActivePath } = detachWorkspaceFromRegistry(abs);
    if (isSameWorkspacePath(abs, def)) {
      return { ok: true, newActivePath, deletedFromDisk: false };
    }
    await fs.promises.rm(abs, { recursive: true, force: true });
    return { ok: true, newActivePath, deletedFromDisk: true };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}
