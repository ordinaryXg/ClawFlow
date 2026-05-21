import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';

const BIN_NAME = process.platform === 'win32' ? 'lark-cli.exe' : 'lark-cli';

function platformKey(): string {
  return process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'darwin' : 'linux';
}

function archKey(): string {
  return process.arch === 'arm64' ? 'arm64' : 'amd64';
}

function relativeBinaryPath(): string {
  return path.join('lark-cli', platformKey(), archKey(), BIN_NAME);
}

/** ClawFlow-managed lark-cli config + downloaded binary root. */
export function getLarkCliDataDir(): string {
  return path.join(app.getPath('userData'), 'lark-cli');
}

export function getLarkCliConfigDir(): string {
  return path.join(getLarkCliDataDir(), 'config');
}

export function getLarkCliBinDir(): string {
  return path.join(getLarkCliDataDir(), 'bin');
}

function existsFile(fp: string): boolean {
  try {
    return fs.existsSync(fp);
  } catch {
    return false;
  }
}

/** Packaged app: process.resourcesPath/lark-cli/... */
export function getPackagedLarkCliBinaryPath(): string | null {
  const resources = process.resourcesPath;
  if (!resources) return null;
  const candidate = path.join(resources, relativeBinaryPath());
  return existsFile(candidate) ? candidate : null;
}

/** Dev / unpackaged: repo resources/lark-cli/... */
export function getDevBundledLarkCliBinaryPath(): string | null {
  const rel = relativeBinaryPath();
  const roots = [
    path.join(process.cwd(), 'resources'),
    path.resolve(__dirname, '../../../resources'),
    path.resolve(__dirname, '../../../../resources'),
  ];
  for (const root of roots) {
    const candidate = path.join(root, rel);
    if (existsFile(candidate)) return candidate;
  }
  return null;
}

/** @deprecated use getPackagedLarkCliBinaryPath */
export function getBundledLarkCliBinaryPath(): string | null {
  return getPackagedLarkCliBinaryPath() ?? getDevBundledLarkCliBinaryPath();
}

export function getInstalledLarkCliBinaryPath(): string {
  return path.join(getLarkCliBinDir(), BIN_NAME);
}

export type LarkCliBinarySource = 'userData' | 'bundled-packaged' | 'bundled-dev' | null;

export function resolveLarkCliBinaryPath(): { path: string | null; source: LarkCliBinarySource } {
  const installed = getInstalledLarkCliBinaryPath();
  if (existsFile(installed)) return { path: installed, source: 'userData' };

  const packaged = getPackagedLarkCliBinaryPath();
  if (packaged) return { path: packaged, source: 'bundled-packaged' };

  const dev = getDevBundledLarkCliBinaryPath();
  if (dev) return { path: dev, source: 'bundled-dev' };

  return { path: null, source: null };
}

export function profileNameForBotId(botId: string): string {
  const safe = String(botId ?? '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .slice(0, 48);
  return `cf-${safe || 'default'}`;
}
