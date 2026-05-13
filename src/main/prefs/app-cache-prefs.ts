/**
 * 应用级「工作区托管缓存根」偏好（userData JSON），与渲染层 localStorage 无关。
 * 工作区 `.agent` / `.subagent` 在工作区根目录；仅 `.clawflow-launcher-stash` 等本机数据在该根下的 `workspaces/<hash>/`。
 */

import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';

export type AppCachePrefsStored = {
  /** 用户自定义缓存根目录（绝对路径）；未设置或无效时回退到 `userData/ClawFlowAppCache` */
  cacheRoot?: string | null;
};

const FILENAME = 'cf.app-cache-prefs.json';

function filePath(): string {
  return path.join(app.getPath('userData'), FILENAME);
}

export function readAppCachePrefsFile(): AppCachePrefsStored {
  try {
    const raw = fs.readFileSync(filePath(), 'utf-8');
    const j = JSON.parse(raw) as AppCachePrefsStored;
    if (!j || typeof j !== 'object') return {};
    return j;
  } catch {
    return {};
  }
}

export function writeAppCachePrefsFile(prefs: AppCachePrefsStored): void {
  fs.mkdirSync(path.dirname(filePath()), { recursive: true });
  fs.writeFileSync(filePath(), JSON.stringify(prefs, null, 2), 'utf-8');
}

/** 与 userData 同级的托管数据目录名，避免把 `workspaces/` 直接堆在 Roaming 应用根下与 cf.*.json 混淆 */
const APP_CACHE_SUBDIR = 'ClawFlowAppCache';

export function getDefaultAppCacheRootSync(): string {
  return path.join(app.getPath('userData'), APP_CACHE_SUBDIR);
}

function pathsEqualWin(a: string, b: string): boolean {
  const ra = path.resolve(a);
  const rb = path.resolve(b);
  if (process.platform === 'win32') return ra.toLowerCase() === rb.toLowerCase();
  return ra === rb;
}

/**
 * 若用户曾把「缓存根」设成整个 userData（会导致 `…/workspaces` 与注册表同级），则清除该偏好。
 * 须在 `loadRegistry` 之前调用一次。
 */
export function sanitizeAppCachePrefsOnStartupSync(): void {
  const prefs = readAppCachePrefsFile();
  const raw = prefs.cacheRoot;
  if (typeof raw !== 'string' || !raw.trim()) return;
  const abs = path.resolve(raw.trim());
  const ud = path.resolve(app.getPath('userData'));
  if (pathsEqualWin(abs, ud)) {
    writeAppCachePrefsFile({ ...prefs, cacheRoot: null });
    console.warn('[app-cache-prefs] cleared invalid cacheRoot (must not equal userData directory)');
  }
}

/** 当前偏好中记录的自定义根（未校验磁盘）；无则 null */
export function getConfiguredAppCacheRootRaw(): string | null {
  const raw = readAppCachePrefsFile().cacheRoot;
  const s = typeof raw === 'string' ? raw.trim() : '';
  return s ? s : null;
}

/**
 * 解析当前应使用的应用缓存根：优先用户配置且可创建目录，否则默认 `userData/ClawFlowAppCache`。
 */
export function getEffectiveAppCacheRootSync(): string {
  const def = getDefaultAppCacheRootSync();
  const configured = getConfiguredAppCacheRootRaw();
  if (!configured) {
    try {
      fs.mkdirSync(path.join(def, 'workspaces'), { recursive: true });
    } catch {
      /* ignore */
    }
    return def;
  }
  const abs = path.resolve(configured);
  const ud = path.resolve(app.getPath('userData'));
  if (pathsEqualWin(abs, ud)) {
    try {
      fs.mkdirSync(path.join(def, 'workspaces'), { recursive: true });
    } catch {
      /* ignore */
    }
    return def;
  }
  try {
    fs.mkdirSync(path.join(abs, 'workspaces'), { recursive: true });
    return abs;
  } catch {
    try {
      fs.mkdirSync(path.join(def, 'workspaces'), { recursive: true });
    } catch {
      /* ignore */
    }
    return def;
  }
}
