/**
 * Windows/Linux：关闭到托盘时创建系统托盘图标与菜单。
 */

import { BrowserWindow, Menu, nativeImage, Tray } from 'electron';

let appTray: Tray | null = null;

export function destroyAppTray(): void {
  if (!appTray) return;
  try {
    appTray.removeAllListeners();
    appTray.destroy();
  } catch {
    /* ignore */
  }
  appTray = null;
}

function showAllWindows(): void {
  const wins = BrowserWindow.getAllWindows().filter((w) => !w.isDestroyed());
  for (const w of wins) {
    try {
      if (!w.isVisible()) w.show();
    } catch {
      /* ignore */
    }
  }
  const focusTarget = wins[wins.length - 1] ?? wins[0];
  try {
    focusTarget?.focus();
  } catch {
    /* ignore */
  }
}

export function ensureAppTray(getLang: () => 'zh' | 'en', onQuit: () => void): void {
  if (appTray) {
    try {
      if ((appTray as { isDestroyed?: () => boolean }).isDestroyed?.()) {
        appTray = null;
      } else {
        return;
      }
    } catch {
      appTray = null;
    }
  }
  let img = nativeImage.createFromPath(process.execPath);
  if (img.isEmpty()) return;
  try {
    const { width, height } = img.getSize();
    if (width > 32 || height > 32) {
      img = img.resize({ width: 16, height: 16 });
    }
  } catch {
    /* use original */
  }
  const zh = getLang() === 'zh';
  const labelShow = zh ? '显示主窗口' : 'Show window';
  const labelQuit = zh ? '退出 ClawFlow' : 'Quit ClawFlow';
  const tray = new Tray(img);
  tray.setToolTip('ClawFlow');
  const show = () => showAllWindows();
  tray.on('click', show);
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: labelShow, click: show },
      { type: 'separator' },
      {
        label: labelQuit,
        click: () => {
          destroyAppTray();
          onQuit();
        },
      },
    ])
  );
  appTray = tray;
}
