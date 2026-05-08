/**
 * Workspace 目录与注册表（主进程）。
 * 每个 workspace 根目录下包含 `.clawflow/`。
 */

import { randomUUID } from 'crypto';
import { app, BrowserWindow, dialog, OpenDialogOptions } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

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
}

const REGISTRY_FILENAME = 'cf.workspace.v1.json';

export function getRegistryPath(): string {
  return path.join(app.getPath('userData'), REGISTRY_FILENAME);
}

/** 默认 workspace：位于 userData 下的固定文件夹（兼容旧版全局对话路径迁移）。 */
export function getDefaultWorkspacePath(): string {
  return path.join(app.getPath('userData'), 'Default Workspace');
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
    const uniq = Array.from(new Set(recent)) as string[];
    return { activeWorkspacePath: active, recentWorkspacePaths: uniq };
  } catch {
    return { activeWorkspacePath: null, recentWorkspacePaths: [] };
  }
}

export function saveRegistry(reg: WorkspaceRegistry): void {
  const p = getRegistryPath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const payload = JSON.stringify(
    {
      activeWorkspacePath: reg.activeWorkspacePath,
      recentWorkspacePaths: reg.recentWorkspacePaths.slice(0, 12),
    },
    null,
    2
  );
  fs.writeFileSync(p, payload, 'utf-8');
}

function bumpRecent(reg: WorkspaceRegistry, workspacePath: string): WorkspaceRegistry {
  const abs = path.resolve(workspacePath);
  const rest = reg.recentWorkspacePaths.filter((p) => path.resolve(p) !== abs);
  return {
    activeWorkspacePath: abs,
    recentWorkspacePaths: [abs, ...rest].slice(0, 12),
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
 * 创建 `.clawflow/`、`workspace.json`，以及 OpenClaw state 根目录占位。
 */
export async function ensureWorkspaceInitialized(workspaceRoot: string): Promise<WorkspaceMeta> {
  const root = path.resolve(workspaceRoot);
  const cf = clawflowDir(root);
  const metaPath = workspaceMetaPath(root);
  const ocDir = openclawStateDir(root);

  await fs.promises.mkdir(cf, { recursive: true });
  await fs.promises.mkdir(ocDir, { recursive: true });

  migrateLegacyConversationsOnce(root);

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
