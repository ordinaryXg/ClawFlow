/**
 * 用户可编辑的网络搜索偏好（持久化到 userData），与启动时环境变量合并后交给 resolveWebSearchConfig。
 */

import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import type { ClawFlowWebSearchUserConfig } from '../../engine/web-search';

const FILENAME = 'cf.web-search-prefs.json';

export type WebSearchPrefsStored = {
  enabled?: boolean;
  provider?: 'auto' | 'brave' | 'duckduckgo' | 'searxng';
  braveApiKey?: string;
  braveBaseUrl?: string;
  searxngBaseUrl?: string;
  searxngApiKey?: string;
  timeoutSeconds?: number;
};

function filePath(): string {
  return path.join(app.getPath('userData'), FILENAME);
}

export function readWebSearchPrefsFile(): WebSearchPrefsStored | null {
  try {
    const raw = fs.readFileSync(filePath(), 'utf-8');
    const j = JSON.parse(raw) as WebSearchPrefsStored;
    if (!j || typeof j !== 'object') return null;
    return j;
  } catch {
    return null;
  }
}

export function writeWebSearchPrefsFile(prefs: WebSearchPrefsStored): void {
  fs.mkdirSync(path.dirname(filePath()), { recursive: true });
  fs.writeFileSync(filePath(), JSON.stringify(prefs, null, 2), 'utf-8');
}

/** 将磁盘偏好覆盖到启动 bootstrap（环境变量等）之上 */
export function mergeWebSearchBootstrapWithFile(
  bootstrap: ClawFlowWebSearchUserConfig | undefined,
  file: WebSearchPrefsStored | null
): ClawFlowWebSearchUserConfig {
  const out: ClawFlowWebSearchUserConfig = { ...(bootstrap ?? {}) };
  if (!file) return out;
  if (typeof file.enabled === 'boolean') out.enabled = file.enabled;
  if (file.provider === 'auto' || file.provider === 'brave' || file.provider === 'duckduckgo' || file.provider === 'searxng') {
    out.provider = file.provider;
  }
  if (Object.prototype.hasOwnProperty.call(file, 'braveApiKey') && typeof file.braveApiKey === 'string') {
    out.braveApiKey = file.braveApiKey;
  }
  if (typeof file.braveBaseUrl === 'string' && file.braveBaseUrl.trim()) {
    out.braveBaseUrl = file.braveBaseUrl.trim();
  }
  if (Object.prototype.hasOwnProperty.call(file, 'searxngBaseUrl')) {
    out.searxngBaseUrl = typeof file.searxngBaseUrl === 'string' ? file.searxngBaseUrl.trim() : '';
  }
  if (Object.prototype.hasOwnProperty.call(file, 'searxngApiKey') && typeof file.searxngApiKey === 'string') {
    out.searxngApiKey = file.searxngApiKey;
  }
  if (typeof file.timeoutSeconds === 'number' && Number.isFinite(file.timeoutSeconds)) {
    out.timeoutSeconds = file.timeoutSeconds;
  }
  return out;
}
