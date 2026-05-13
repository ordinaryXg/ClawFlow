/**
 * 主进程可读的应用 UI 偏好（关闭按钮行为等），与渲染层 localStorage 通过 IPC 同步。
 * 文件位于 userData，保证在首屏渲染前 window:close 已能读到正确策略。
 */

import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';

export type CloseButtonAction = 'quit' | 'minimizeToTray';

export interface MainUiPrefs {
  closeButtonAction: CloseButtonAction;
}

const PREFS_FILENAME = 'cf.main-ui-prefs.json';

function prefsPath(): string {
  return path.join(app.getPath('userData'), PREFS_FILENAME);
}

const DEFAULT_PREFS: MainUiPrefs = { closeButtonAction: 'quit' };

let cache: MainUiPrefs = { ...DEFAULT_PREFS };

export function readMainUiPrefsFromDisk(): MainUiPrefs {
  try {
    const raw = fs.readFileSync(prefsPath(), 'utf-8');
    const j = JSON.parse(raw) as { closeButtonAction?: unknown };
    const a = j?.closeButtonAction === 'minimizeToTray' ? 'minimizeToTray' : 'quit';
    cache = { closeButtonAction: a };
  } catch {
    cache = { ...DEFAULT_PREFS };
  }
  return cache;
}

export function getMainUiPrefs(): MainUiPrefs {
  return { ...cache };
}

export function saveMainUiPrefs(partial: Partial<MainUiPrefs>): MainUiPrefs {
  if (partial.closeButtonAction === 'minimizeToTray' || partial.closeButtonAction === 'quit') {
    cache = { closeButtonAction: partial.closeButtonAction };
  }
  try {
    fs.mkdirSync(path.dirname(prefsPath()), { recursive: true });
    fs.writeFileSync(prefsPath(), JSON.stringify(cache, null, 2), 'utf-8');
  } catch {
    /* ignore */
  }
  return cache;
}
