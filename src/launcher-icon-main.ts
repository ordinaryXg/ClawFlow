/**
 * 主进程：为「收纳快捷方式」解析系统图标（.lnk / .exe 等）。
 * Electron app.getFileIcon 对 Windows .lnk 常返回空图，故增加 PowerShell + System.Drawing 后备。
 */
import { execFile } from 'child_process';
import { app, nativeImage, shell } from 'electron';
import type { NativeImage } from 'electron';
import * as path from 'path';

type WinShortcutDetails = { icon?: string; target?: string };
type ShellWithShortcut = typeof shell & { readShortcutLink?: (shortcutPath: string) => WinShortcutDetails };

function toDataUrl(icon: NativeImage): string {
  try {
    const { width, height } = icon.getSize();
    if (width > 64 || height > 64) return icon.resize({ width: 48, height: 48 }).toDataURL();
    return icon.toDataURL();
  } catch {
    return icon.toDataURL();
  }
}

async function tryElectronIconFromPath(p: string): Promise<NativeImage | null> {
  for (const size of ['large', 'normal'] as const) {
    try {
      const icon = await app.getFileIcon(p, { size });
      if (!icon.isEmpty()) return icon;
    } catch {
      /* next */
    }
  }
  return null;
}

/** Windows：通过 PowerShell 调用 GDI+ 提取与资源管理器关联的图标（对 .lnk 通常比 getFileIcon 可靠） */
function tryWindowsExtractAssociatedIconPng(absPath: string): Promise<Buffer | null> {
  if (process.platform !== 'win32') return Promise.resolve(null);
  const ps = `
Add-Type -AssemblyName System.Drawing
try {
  $p = $env:CLAWFLOW_ICON_PATH
  if ([string]::IsNullOrWhiteSpace($p)) { exit 2 }
  $ico = [System.Drawing.Icon]::ExtractAssociatedIcon($p)
  if ($null -eq $ico) { exit 3 }
  $bmp = $ico.ToBitmap()
  $ms = New-Object System.IO.MemoryStream
  $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
  [Console]::Out.Write([Convert]::ToBase64String($ms.ToArray()))
} catch {
  exit 1
}
`.trim();
  const encoded = Buffer.from(ps, 'utf16le').toString('base64');
  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-STA', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-EncodedCommand', encoded],
      {
        maxBuffer: 8 * 1024 * 1024,
        timeout: 15000,
        env: { ...process.env, CLAWFLOW_ICON_PATH: absPath },
      },
      (err, stdout) => {
        if (err) {
          resolve(null);
          return;
        }
        const out = String(stdout ?? '')
          .trim()
          .replace(/\r?\n/g, '');
        if (!out) {
          resolve(null);
          return;
        }
        try {
          resolve(Buffer.from(out, 'base64'));
        } catch {
          resolve(null);
        }
      }
    );
  });
}

function buildIconCandidates(raw: string): string[] {
  const norm = (p: string) => {
    const t = p.trim();
    if (!t) return t;
    try {
      return path.normalize(t);
    } catch {
      return t;
    }
  };
  const candidates: string[] = [];
  const shellWin = shell as ShellWithShortcut;
  if (process.platform === 'win32' && raw.toLowerCase().endsWith('.lnk') && typeof shellWin.readShortcutLink === 'function') {
    try {
      const det = shellWin.readShortcutLink(raw);
      const iconPath = typeof det.icon === 'string' ? det.icon.trim() : '';
      const target = typeof det.target === 'string' ? det.target.trim() : '';
      if (iconPath) candidates.push(norm(iconPath));
      if (target) candidates.push(norm(target));
    } catch {
      /* ignore */
    }
  }
  candidates.push(norm(raw));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of candidates) {
    if (!p) continue;
    const k = p.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(p);
  }
  return out;
}

export async function getLauncherIconDataUrl(
  absolutePath: string
): Promise<{ ok: true; dataUrl: string } | { ok: false; error: string }> {
  const raw = String(absolutePath ?? '').trim();
  if (!raw || !path.isAbsolute(raw)) {
    return { ok: false as const, error: 'invalid_path' };
  }

  const candidates = buildIconCandidates(raw);
  for (const p of candidates) {
    const icon = await tryElectronIconFromPath(p);
    if (icon) {
      try {
        return { ok: true as const, dataUrl: toDataUrl(icon) };
      } catch {
        /* next candidate */
      }
    }
  }

  if (process.platform === 'win32') {
    for (const p of candidates) {
      const buf = await tryWindowsExtractAssociatedIconPng(p);
      if (buf && buf.length > 8) {
        try {
          const img = nativeImage.createFromBuffer(buf);
          if (!img.isEmpty()) return { ok: true as const, dataUrl: toDataUrl(img) };
        } catch {
          /* next */
        }
      }
    }
  }

  return { ok: false as const, error: 'empty_icon' };
}
