import { shell, type WebContents } from 'electron';
import { isSafeHttpUrl } from '../utils/normalize-http-url';

/** http(s)/mailto 且非当前应用 origin 的 URL 应在系统浏览器中打开。 */
function shouldOpenInSystemBrowser(url: string, webContents: WebContents): boolean {
  let target: URL;
  try {
    target = new URL(url);
  } catch {
    return false;
  }

  if (target.protocol === 'mailto:') return true;
  if (!isSafeHttpUrl(url)) return false;

  const current = webContents.getURL();
  if (!current) return true;

  try {
    const origin = new URL(current);
    if (origin.protocol === 'file:') return true;
    if (origin.protocol === 'http:' || origin.protocol === 'https:') {
      return origin.origin !== target.origin;
    }
    return true;
  } catch {
    return true;
  }
}

/** 拦截窗口内导航与 target=_blank，将外部链接交给系统默认浏览器。 */
export function attachShellExternalLinkPolicy(webContents: WebContents): void {
  webContents.setWindowOpenHandler(({ url }) => {
    if (shouldOpenInSystemBrowser(url, webContents)) {
      void shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  webContents.on('will-navigate', (event, url) => {
    if (shouldOpenInSystemBrowser(url, webContents)) {
      event.preventDefault();
      void shell.openExternal(url);
    }
  });
}

export function isOpenExternalAllowedUrl(raw: string): boolean {
  const url = String(raw ?? '').trim();
  if (!url) return false;
  try {
    const u = new URL(url);
    return u.protocol === 'mailto:' || isSafeHttpUrl(url);
  } catch {
    return false;
  }
}
