/**
 * 主进程：收纳时将「桌面」上的快捷方式移入当前工作区下的隐藏目录
 * `{workspaceRoot}/.clawflow-launcher-stash/`（子目录内项不会作为桌面图标展示），
 * 退出或取消收纳时再移回；manifest 与 stash 同属该工作区，便于备份与权限一致。
 */
import { execFile } from 'child_process';
import { randomUUID } from 'crypto';
import { promisify } from 'util';
import * as fsSync from 'fs';
import * as os from 'os';
import * as fs from 'fs/promises';
import * as path from 'path';
import { app } from 'electron';

const execFileAsync = promisify(execFile);

export const LAUNCHER_STASH_DIR = '.clawflow-launcher-stash';

export type SetDesktopEntryHiddenResult =
  | { ok: true; mode: 'stashed'; stashedPath: string; originalPath: string; leftSourceInPlace?: boolean }
  | { ok: true; mode: 'unchanged' }
  | { ok: true; mode: 'restored'; originalPath: string }
  | { ok: true; mode: 'noop' }
  | { ok: false; error: string };

type ManifestV1 = { version: 1; entries: Array<{ original: string; stashed: string }> };

type SessionEntry = { original: string; stashed: string; workspaceRoot: string };

/** key = normalizeKey(stashed) */
const sessionByStashedNorm = new Map<string, SessionEntry>();

const stealthAppliedRoots = new Set<string>();

let willQuitHookRegistered = false;

export function normalizeLauncherPathKey(p: string): string {
  return path.normalize(p).replace(/\\/g, '/').toLowerCase();
}

function tryRealPath(p: string): string | null {
  try {
    return fsSync.realpathSync.native(p);
  } catch {
    try {
      return fsSync.realpathSync(p);
    } catch {
      return null;
    }
  }
}

function collectDesktopRoots(): string[] {
  const roots = new Set<string>();
  try {
    roots.add(app.getPath('desktop'));
  } catch {
    /* ignore */
  }
  const home = os.homedir();
  if (home) {
    roots.add(path.join(home, 'Desktop'));
    roots.add(path.join(home, '桌面'));
  }
  if (process.platform === 'win32') {
    const pub = process.env.PUBLIC;
    if (pub?.trim()) {
      const p = pub.trim();
      roots.add(path.join(p, 'Desktop'));
      roots.add(path.join(p, '桌面'));
    }
    for (const key of ['OneDrive', 'OneDriveConsumer'] as const) {
      const v = process.env[key];
      if (v?.trim()) roots.add(path.join(v.trim(), 'Desktop'));
    }
  }
  return [...roots].filter((x) => Boolean(x && x.trim()));
}

/** 工作区根下的 stash 目录（绝对路径） */
export function getLauncherStashDir(workspaceRoot: string): string {
  return path.join(path.resolve(workspaceRoot.trim()), LAUNCHER_STASH_DIR);
}

/** 从位于 stash 内的任意路径解析工作区根（如 `…/ws/.clawflow-launcher-stash/foo.lnk` → `…/ws`） */
export function workspaceRootFromStashPath(stashedOrInside: string): string | null {
  const resolved = path.resolve(String(stashedOrInside ?? '').trim());
  let cur = resolved;
  for (let depth = 0; depth < 16; depth++) {
    const base = path.basename(cur);
    if (normalizeLauncherPathKey(base) === normalizeLauncherPathKey(LAUNCHER_STASH_DIR)) {
      return path.dirname(cur);
    }
    const parent = path.dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }
  return null;
}

function manifestPath(workspaceRoot: string): string {
  return path.join(getLauncherStashDir(workspaceRoot), 'manifest.json');
}

function readManifest(workspaceRoot: string): ManifestV1 {
  try {
    const raw = fsSync.readFileSync(manifestPath(workspaceRoot), 'utf8');
    const o = JSON.parse(raw) as Partial<ManifestV1>;
    if (o && o.version === 1 && Array.isArray(o.entries)) return { version: 1, entries: o.entries };
  } catch {
    /* ignore */
  }
  return { version: 1, entries: [] };
}

function writeManifest(workspaceRoot: string, m: ManifestV1): void {
  const stashRoot = getLauncherStashDir(workspaceRoot);
  fsSync.mkdirSync(stashRoot, { recursive: true });
  fsSync.writeFileSync(manifestPath(workspaceRoot), JSON.stringify(m), 'utf8');
}

function manifestAdd(workspaceRoot: string, original: string, stashed: string): void {
  const m = readManifest(workspaceRoot);
  const no = m.entries.filter(
    (e) =>
      normalizeLauncherPathKey(e.stashed) !== normalizeLauncherPathKey(stashed) &&
      normalizeLauncherPathKey(e.original) !== normalizeLauncherPathKey(original)
  );
  no.push({ original, stashed });
  writeManifest(workspaceRoot, { version: 1, entries: no });
}

function manifestRemovePair(workspaceRoot: string, original: string, stashed: string): void {
  const m = readManifest(workspaceRoot);
  m.entries = m.entries.filter(
    (e) =>
      normalizeLauncherPathKey(e.stashed) !== normalizeLauncherPathKey(stashed) &&
      normalizeLauncherPathKey(e.original) !== normalizeLauncherPathKey(original)
  );
  writeManifest(workspaceRoot, m);
}

function findManifestEntry(absPath: string, workspacePath?: string): { original: string; stashed: string } | null {
  const n = normalizeLauncherPathKey(path.resolve(absPath.trim()));
  const tryRead = (ws: string): { original: string; stashed: string } | null => {
    const m = readManifest(ws);
    for (const e of m.entries) {
      if (normalizeLauncherPathKey(e.stashed) === n || normalizeLauncherPathKey(e.original) === n) {
        return { original: e.original, stashed: e.stashed };
      }
    }
    return null;
  };
  if (workspacePath?.trim()) {
    const hit = tryRead(path.resolve(workspacePath.trim()));
    if (hit) return hit;
  }
  const fromStash = workspaceRootFromStashPath(absPath);
  if (fromStash) {
    const hit = tryRead(fromStash);
    if (hit) return hit;
  }
  return null;
}

function isInsideLauncherStash(absPath: string): boolean {
  const k = normalizeLauncherPathKey(absPath);
  return k.includes(`/${LAUNCHER_STASH_DIR}/`) || k.includes(`\\${LAUNCHER_STASH_DIR}\\`);
}

/** 是否位于常见「桌面」目录下（含 OneDrive / 公共桌面 / realpath） */
export function isUnderDesktopFolder(absPath: string): boolean {
  const resolved = path.resolve(String(absPath ?? '').trim());
  const fileKey = normalizeLauncherPathKey(tryRealPath(resolved) ?? resolved);
  for (const d of collectDesktopRoots()) {
    const dn = normalizeLauncherPathKey(tryRealPath(d) ?? d);
    if (!dn) continue;
    if (fileKey === dn || fileKey.startsWith(`${dn}/`)) return true;
  }
  return false;
}

/** 返回包含该路径的桌面根目录（取最长前缀匹配） */
export function containingDesktopRoot(absPath: string): string | null {
  const resolved = path.resolve(String(absPath ?? '').trim());
  const fileKey = normalizeLauncherPathKey(tryRealPath(resolved) ?? resolved);
  let best: { len: number; root: string } | null = null;
  for (const d of collectDesktopRoots()) {
    const realD = tryRealPath(d) ?? path.normalize(d);
    const dn = normalizeLauncherPathKey(realD);
    if (!dn) continue;
    if (fileKey === dn || fileKey.startsWith(`${dn}/`)) {
      if (!best || dn.length > best.len) best = { len: dn.length, root: realD };
    }
  }
  return best?.root ?? null;
}

function getCurrentUserDesktopRoot(): string | null {
  try {
    const desktop = app.getPath('desktop');
    return path.resolve(tryRealPath(desktop) ?? desktop);
  } catch {
    return null;
  }
}

function isUnderCurrentUserDesktop(absPath: string): boolean {
  const desktopRoot = getCurrentUserDesktopRoot();
  if (!desktopRoot) return false;
  const resolved = path.resolve(String(absPath ?? '').trim());
  const fileKey = normalizeLauncherPathKey(tryRealPath(resolved) ?? resolved);
  const rootKey = normalizeLauncherPathKey(desktopRoot);
  return fileKey === rootKey || fileKey.startsWith(`${rootKey}/`);
}

function uniquePathInDirectory(dir: string, original: string): string {
  const base = path.basename(original);
  let candidate = path.join(dir, base);
  if (!fsSync.existsSync(candidate)) return candidate;
  const { name, ext } = path.parse(original);
  for (let i = 0; i < 32; i++) {
    const suf = randomUUID().slice(0, 8);
    candidate = path.join(dir, `${name}_${suf}${ext}`);
    if (!fsSync.existsSync(candidate)) return candidate;
  }
  return path.join(dir, `${name}_${Date.now()}${ext}`);
}

async function ensureStashDirStealth(stashRoot: string): Promise<void> {
  await fs.mkdir(stashRoot, { recursive: true });
  const k = normalizeLauncherPathKey(stashRoot);
  if (stealthAppliedRoots.has(k)) return;
  stealthAppliedRoots.add(k);
  try {
    if (process.platform === 'win32') {
      await execFileAsync('attrib', ['+h', '+s', stashRoot], { windowsHide: true, timeout: 15000 });
    } else if (process.platform === 'darwin') {
      await execFileAsync('chflags', ['hidden', stashRoot], { timeout: 15000 });
    }
  } catch {
    /* best-effort */
  }
}

function uniqueStashedPath(stashDir: string, original: string): string {
  const base = path.basename(original);
  let candidate = path.join(stashDir, base);
  if (!fsSync.existsSync(candidate)) return candidate;
  const { name, ext } = path.parse(original);
  for (let i = 0; i < 32; i++) {
    const suf = randomUUID().slice(0, 8);
    candidate = path.join(stashDir, `${name}_${suf}${ext}`);
    if (!fsSync.existsSync(candidate)) return candidate;
  }
  return path.join(stashDir, `${name}_${Date.now()}${ext}`);
}

async function movePath(
  src: string,
  dst: string
): Promise<{ ok: true; removedSource: boolean } | { ok: false; error: string }> {
  try {
    await fs.rename(src, dst);
    return { ok: true, removedSource: true };
  } catch {
    try {
      await fs.copyFile(src, dst);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return { ok: false, error: msg };
    }
    try {
      await fs.unlink(src);
      return { ok: true, removedSource: true };
    } catch {
      /** 常见于公共桌面：当前用户可复制但不可删原快捷方式 */
      return { ok: true, removedSource: false };
    }
  }
}

function movePathSync(src: string, dst: string): boolean {
  try {
    fsSync.renameSync(src, dst);
    return true;
  } catch {
    try {
      fsSync.copyFileSync(src, dst);
      fsSync.unlinkSync(src);
      return true;
    } catch {
      return false;
    }
  }
}

function resolveManifestWorkspace(
  entry: { original: string; stashed: string; workspaceRoot?: string },
  workspaceHint?: string
): string | null {
  if (entry.workspaceRoot) return path.resolve(entry.workspaceRoot);
  const fromStash = workspaceRootFromStashPath(entry.stashed);
  if (fromStash) return fromStash;
  if (workspaceHint?.trim()) return path.resolve(workspaceHint.trim());
  return null;
}

function findSessionEntry(absPath: string): SessionEntry | null {
  const n = normalizeLauncherPathKey(path.resolve(absPath.trim()));
  const direct = sessionByStashedNorm.get(n);
  if (direct) return direct;
  for (const v of sessionByStashedNorm.values()) {
    if (normalizeLauncherPathKey(v.stashed) === n || normalizeLauncherPathKey(v.original) === n) return v;
  }
  return null;
}

async function stashDesktopFile(originalPath: string, workspacePath: string): Promise<SetDesktopEntryHiddenResult> {
  const raw = path.resolve(originalPath.trim());
  if (!raw || !path.isAbsolute(raw)) return { ok: false, error: 'invalid_path' };
  if (isInsideLauncherStash(raw)) return { ok: false, error: 'already_stashed' };
  if (!isUnderDesktopFolder(raw)) return { ok: true, mode: 'unchanged' };

  const ws = path.resolve(workspacePath.trim());
  if (!workspacePath.trim() || !path.isAbsolute(ws)) return { ok: false, error: 'workspace_required' };

  try {
    await fs.access(raw);
  } catch {
    return { ok: false, error: 'not_found' };
  }

  if (!containingDesktopRoot(raw)) return { ok: false, error: 'not_under_desktop' };

  const currentUserDesktopRoot = getCurrentUserDesktopRoot();
  let sourcePath = raw;
  if (!isUnderCurrentUserDesktop(raw) && currentUserDesktopRoot) {
    const userDesktopCopy = uniquePathInDirectory(currentUserDesktopRoot, raw);
    try {
      await fs.copyFile(raw, userDesktopCopy);
      sourcePath = userDesktopCopy;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return { ok: false, error: `copy_to_user_desktop_failed: ${msg}` };
    }
  }

  const stashDir = getLauncherStashDir(ws);
  await ensureStashDirStealth(stashDir);
  const dest = uniqueStashedPath(stashDir, sourcePath);

  const moved = await movePath(sourcePath, dest);
  if (!moved.ok) return { ok: false, error: moved.error };

  const entry: SessionEntry = { original: sourcePath, stashed: dest, workspaceRoot: ws };
  sessionByStashedNorm.set(normalizeLauncherPathKey(dest), entry);
  manifestAdd(ws, sourcePath, dest);

  return {
    ok: true,
    mode: 'stashed',
    stashedPath: dest,
    originalPath: sourcePath,
    ...(moved.removedSource ? {} : { leftSourceInPlace: true as const }),
  };
}

async function restoreDesktopFile(
  stashedOrOriginal: string,
  workspacePath?: string
): Promise<SetDesktopEntryHiddenResult> {
  const hint = path.resolve(String(stashedOrOriginal ?? '').trim());
  if (!hint) return { ok: false, error: 'invalid_path' };

  const session = findSessionEntry(hint);
  const manifestHit = session ? null : findManifestEntry(hint, workspacePath);
  const pack =
    session != null
      ? { original: session.original, stashed: session.stashed, workspaceRoot: session.workspaceRoot }
      : manifestHit != null
        ? { original: manifestHit.original, stashed: manifestHit.stashed }
        : null;

  if (!pack) {
    if (isUnderDesktopFolder(hint) && !isInsideLauncherStash(hint)) {
      try {
        await fs.access(hint);
        return { ok: true, mode: 'noop' };
      } catch {
        return { ok: false, error: 'not_found' };
      }
    }
    return { ok: true, mode: 'noop' };
  }

  const { original, stashed } = pack;
  const wsResolved = resolveManifestWorkspace(pack, workspacePath);
  if (!wsResolved) {
    return { ok: false, error: 'workspace_required' };
  }

  try {
    await fs.access(stashed);
  } catch {
    sessionByStashedNorm.delete(normalizeLauncherPathKey(stashed));
    manifestRemovePair(wsResolved, original, stashed);
    return { ok: true, mode: 'noop' };
  }

  if (fsSync.existsSync(original)) {
    try {
      await fs.unlink(stashed);
    } catch {
      /* ignore */
    }
    sessionByStashedNorm.delete(normalizeLauncherPathKey(stashed));
    manifestRemovePair(wsResolved, original, stashed);
    return { ok: true, mode: 'restored', originalPath: original };
  }

  const parent = path.dirname(original);
  try {
    await fs.mkdir(parent, { recursive: true });
  } catch {
    /* ignore */
  }

  const moved = await movePath(stashed, original);
  if (!moved.ok) return { ok: false, error: moved.error };

  sessionByStashedNorm.delete(normalizeLauncherPathKey(stashed));
  manifestRemovePair(wsResolved, original, stashed);

  return { ok: true, mode: 'restored', originalPath: original };
}

/** 应用退出前：把本会话移入 stash 的桌面项全部移回原路径 */
export function restoreSessionHiddenDesktopPinsSync(): void {
  const seen = new Set<string>();
  for (const e of [...sessionByStashedNorm.values()]) {
    const k = normalizeLauncherPathKey(e.stashed);
    if (seen.has(k)) continue;
    seen.add(k);
    const ws = e.workspaceRoot;
    try {
      if (!fsSync.existsSync(e.stashed)) continue;
      if (fsSync.existsSync(e.original)) {
        try {
          fsSync.unlinkSync(e.stashed);
        } catch {
          /* ignore */
        }
        manifestRemovePair(ws, e.original, e.stashed);
        continue;
      }
      const parent = path.dirname(e.original);
      try {
        fsSync.mkdirSync(parent, { recursive: true });
      } catch {
        /* ignore */
      }
      movePathSync(e.stashed, e.original);
      manifestRemovePair(ws, e.original, e.stashed);
    } catch {
      /* ignore */
    }
  }
  sessionByStashedNorm.clear();
}

/** 启动 / 切换工作区时：尝试把 manifest 中仍留在 stash 的项移回桌面 */
export async function sweepLauncherStashForWorkspace(workspacePath: string): Promise<void> {
  const ws = path.resolve(workspacePath.trim());
  if (!ws) return;
  const m = readManifest(ws);
  if (m.entries.length === 0) return;
  const next: typeof m.entries = [];
  for (const e of m.entries) {
    const stOk = fsSync.existsSync(e.stashed);
    const origOk = fsSync.existsSync(e.original);
    if (!stOk) continue;
    if (origOk) {
      try {
        fsSync.unlinkSync(e.stashed);
      } catch {
        next.push(e);
      }
      continue;
    }
    const parent = path.dirname(e.original);
    try {
      fsSync.mkdirSync(parent, { recursive: true });
    } catch {
      next.push(e);
      continue;
    }
    if (movePathSync(e.stashed, e.original)) continue;
    next.push(e);
  }
  writeManifest(ws, { version: 1, entries: next });
}

export function registerDesktopPinSessionRestoreOnQuit(): void {
  if (willQuitHookRegistered) return;
  willQuitHookRegistered = true;
  app.on('will-quit', () => {
    restoreSessionHiddenDesktopPinsSync();
  });
}

export async function setDesktopEntryHidden(
  absolutePath: string,
  hidden: boolean,
  workspacePath?: string
): Promise<SetDesktopEntryHiddenResult> {
  if (hidden) return stashDesktopFile(absolutePath, String(workspacePath ?? ''));
  return restoreDesktopFile(absolutePath, workspacePath);
}
