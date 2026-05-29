/**
 * 每工作区在应用缓存根下 `workspaces/<stableHash>/` 仅托管 **本机** 数据：
 * - **`.clawflow-launcher-stash/`**（收纳内容不同步、不随仓库迁移）
 * - **`workspace-root.txt`**（从 stash 路径反查工作区根）
 *
 * **`.agent/`** 在工作区根目录下（便于 Git 忽略规则与仓库整体迁移）。
 */

import { createHash } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import {
  getDefaultAppCacheRootSync,
  getEffectiveAppCacheRootSync,
  readAppCachePrefsFile,
  writeAppCachePrefsFile,
} from '../prefs/app-cache-prefs';

export const LAUNCHER_STASH_DIR = '.clawflow-launcher-stash';

/** 与 stash 同级的 blob 目录内标记文件，内容为该 blob 对应的工作区根绝对路径（单行） */
export const WORKSPACE_ROOT_POINTER_FILE = 'workspace-root.txt';

const WORKSPACES_SUBDIR = 'workspaces';

function workspaceKeyForHash(workspaceRoot: string): string {
  const r = path.resolve(String(workspaceRoot ?? '').trim());
  if (process.platform === 'win32') return r.replace(/\\/g, '/').toLowerCase();
  return r;
}

export function workspaceBlobId(workspaceRoot: string): string {
  return createHash('sha256').update(workspaceKeyForHash(workspaceRoot), 'utf8').digest('hex');
}

export function workspaceBlobDirAbs(workspaceRoot: string): string {
  const base = getEffectiveAppCacheRootSync();
  return path.join(base, WORKSPACES_SUBDIR, workspaceBlobId(workspaceRoot));
}

export function launcherStashDirAbs(workspaceRoot: string): string {
  return path.join(workspaceBlobDirAbs(workspaceRoot), LAUNCHER_STASH_DIR);
}

function isExdev(e: unknown): boolean {
  const err = e as NodeJS.ErrnoException;
  return err?.code === 'EXDEV';
}

function tryMovePathSync(from: string, to: string): void {
  if (!fs.existsSync(from)) return;
  if (fs.existsSync(to)) return;
  try {
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.renameSync(from, to);
  } catch (e) {
    if (!isExdev(e)) {
      console.warn('[workspace-blob-store] tryMovePathSync rename failed:', from, '->', to, e);
      return;
    }
    try {
      fs.cpSync(from, to, { recursive: true });
      fs.rmSync(from, { recursive: true, force: true });
    } catch (e2) {
      console.warn('[workspace-blob-store] tryMovePathSync cp fallback failed:', from, '->', to, e2);
    }
  }
}

/**
 * 工作区根下的 **`.clawflow-launcher-stash`** → 迁入 blob（本机缓存；若 blob 侧已存在则跳过），并写入 `workspace-root.txt`。
 */
export function syncWorkspaceBlobLayoutSync(workspaceRoot: string): void {
  const root = path.resolve(String(workspaceRoot ?? '').trim());
  if (!root) return;
  const blob = workspaceBlobDirAbs(workspaceRoot);
  try {
    fs.mkdirSync(blob, { recursive: true });
  } catch (e) {
    console.warn('[workspace-blob-store] mkdir blob failed:', e);
    return;
  }

  tryMovePathSync(path.join(root, LAUNCHER_STASH_DIR), path.join(blob, LAUNCHER_STASH_DIR));
  ensureWorkspaceBlobPointerSync(workspaceRoot);
}

export function ensureWorkspaceBlobPointerSync(workspaceRoot: string): void {
  const root = path.resolve(String(workspaceRoot ?? '').trim());
  if (!root) return;
  const blob = workspaceBlobDirAbs(workspaceRoot);
  try {
    fs.mkdirSync(blob, { recursive: true });
  } catch {
    return;
  }
  const fp = path.join(blob, WORKSPACE_ROOT_POINTER_FILE);
  const line = `${root}\n`;
  try {
    let write = true;
    if (fs.existsSync(fp)) {
      const cur = fs.readFileSync(fp, 'utf8').trim().split(/\r?\n/)[0] ?? '';
      if (cur && path.resolve(cur) === root) write = false;
    }
    if (write) fs.writeFileSync(fp, line, 'utf8');
  } catch (e) {
    console.warn('[workspace-blob-store] write pointer failed:', e);
  }
}

/** 从 blob 目录读取对应工作区根；无效则 null */
export function readWorkspaceRootFromBlobDir(blobDir: string): string | null {
  try {
    const fp = path.join(blobDir, WORKSPACE_ROOT_POINTER_FILE);
    if (!fs.existsSync(fp)) return null;
    const line = fs.readFileSync(fp, 'utf8').trim().split(/\r?\n/)[0] ?? '';
    if (!line) return null;
    return path.resolve(line);
  } catch {
    return null;
  }
}

async function migrateWorkspacesTreeBetweenRoots(oldRoot: string, newRoot: string): Promise<void> {
  const from = path.join(oldRoot, WORKSPACES_SUBDIR);
  if (!fs.existsSync(from)) return;
  await fs.promises.mkdir(newRoot, { recursive: true });
  const to = path.join(newRoot, WORKSPACES_SUBDIR);
  let toExists = false;
  try {
    const st = await fs.promises.stat(to);
    toExists = st.isDirectory();
  } catch {
    toExists = false;
  }
  if (!toExists) {
    try {
      await fs.promises.rename(from, to);
      return;
    } catch (e) {
      if (!isExdev(e)) throw e;
      await fs.promises.mkdir(to, { recursive: true });
    }
  } else {
    await fs.promises.mkdir(to, { recursive: true });
  }
  const names = await fs.promises.readdir(from);
  for (const name of names) {
    const fp = path.join(from, name);
    const tp = path.join(to, name);
    let st: fs.Stats;
    try {
      st = await fs.promises.stat(fp);
    } catch {
      continue;
    }
    if (!st.isDirectory()) continue;
    if (!fs.existsSync(tp)) {
      try {
        await fs.promises.rename(fp, tp);
        continue;
      } catch {
        await fs.promises.cp(fp, tp, { recursive: true });
        await fs.promises.rm(fp, { recursive: true, force: true });
        continue;
      }
    }
    await fs.promises.cp(fp, tp, { recursive: true });
    await fs.promises.rm(fp, { recursive: true, force: true });
  }
  try {
    const left = await fs.promises.readdir(from);
    if (left.length === 0) await fs.promises.rm(from, { recursive: false });
  } catch {
    /* ignore */
  }
}

function pathsEqualCacheRoot(a: string, b: string): boolean {
  const ra = path.resolve(a);
  const rb = path.resolve(b);
  if (process.platform === 'win32') return ra.toLowerCase() === rb.toLowerCase();
  return ra === rb;
}

/**
 * 设置新的应用缓存根并将 `workspaces/` 子树从旧根迁过去（复制合并 + 删除源子项），再写入偏好。
 * `null` 表示恢复为默认 `userData/ClawFlowAppCache`。
 */
export async function setAppCacheRootAndMigrate(
  newRoot: string | null
): Promise<{ ok: true; effectiveRoot: string } | { ok: false; error: string }> {
  try {
    await app.whenReady();
  } catch {
    /* ignore */
  }

  const target =
    newRoot == null || !String(newRoot).trim()
      ? getDefaultAppCacheRootSync()
      : path.resolve(String(newRoot).trim());

  const oldEffective = getEffectiveAppCacheRootSync();
  if (pathsEqualCacheRoot(oldEffective, target)) {
    if (newRoot == null || !String(newRoot).trim()) {
      writeAppCachePrefsFile({ ...readAppCachePrefsFile(), cacheRoot: null });
    }
    try {
      await fs.promises.mkdir(path.join(target, WORKSPACES_SUBDIR), { recursive: true });
    } catch {
      /* ignore */
    }
    return { ok: true, effectiveRoot: getEffectiveAppCacheRootSync() };
  }

  try {
    await fs.promises.mkdir(target, { recursive: true });
    await migrateWorkspacesTreeBetweenRoots(oldEffective, target);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }

  const nextPrefs = { ...readAppCachePrefsFile(), cacheRoot: newRoot == null || !String(newRoot).trim() ? null : target };
  writeAppCachePrefsFile(nextPrefs);

  try {
    await fs.promises.mkdir(path.join(getEffectiveAppCacheRootSync(), WORKSPACES_SUBDIR), { recursive: true });
  } catch {
    /* ignore */
  }

  return { ok: true, effectiveRoot: getEffectiveAppCacheRootSync() };
}
