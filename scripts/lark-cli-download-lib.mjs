/**
 * Download lark-cli release binaries into resources/lark-cli/{platform}/{arch}/.
 * Mirrors @larksuite/cli scripts/install.js platform naming.
 */

import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT_ROOT = path.join(ROOT, 'resources', 'lark-cli');

export const LARK_CLI_VERSION = '1.0.35';
export const LARK_CLI_REPO = 'larksuite/cli';

const PLATFORM_MAP = {
  darwin: 'darwin',
  linux: 'linux',
  win32: 'windows',
};

const ARCH_MAP = {
  x64: 'amd64',
  arm64: 'arm64',
};

const ALLOWED_HOSTS = new Set(['github.com', 'objects.githubusercontent.com', 'registry.npmmirror.com']);

export function archiveName(platformKey, archKey) {
  const ext = platformKey === 'windows' ? '.zip' : '.tar.gz';
  return `lark-cli-${LARK_CLI_VERSION}-${platformKey}-${archKey}${ext}`;
}

export function binaryName(platformKey) {
  return platformKey === 'windows' ? 'lark-cli.exe' : 'lark-cli';
}

export function targetOutDir(platformKey, archKey) {
  return path.join(OUT_ROOT, platformKey, archKey);
}

function assertAllowedHost(url) {
  const { hostname } = new URL(url);
  if (!ALLOWED_HOSTS.has(hostname)) {
    throw new Error(`Download host not allowed: ${hostname}`);
  }
}

function download(url, destPath) {
  assertAllowedHost(url);
  const args = [
    '--fail',
    '--location',
    '--silent',
    '--show-error',
    '--connect-timeout',
    '10',
    '--max-time',
    '180',
    '--max-redirs',
    '3',
    '--output',
    destPath,
  ];
  if (process.platform === 'win32') args.unshift('--ssl-revoke-best-effort');
  args.push(url);
  execFileSync('curl', args, { stdio: ['ignore', 'ignore', 'pipe'] });
}

function extractZipWindows(archivePath, destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  execFileSync('tar', ['-xf', archivePath, '-C', destDir], { stdio: 'inherit', windowsHide: true });
}

function extractArchive(archivePath, destDir, platformKey) {
  fs.mkdirSync(destDir, { recursive: true });
  if (platformKey === 'windows') {
    extractZipWindows(archivePath, destDir);
    return;
  }
  execFileSync('tar', ['-xzf', archivePath, '-C', destDir], { stdio: 'inherit' });
}

export async function fetchOne(platformKey, archKey) {
  const archive = archiveName(platformKey, archKey);
  const url = `https://github.com/${LARK_CLI_REPO}/releases/download/v${LARK_CLI_VERSION}/${archive}`;
  const outDir = targetOutDir(platformKey, archKey);
  const bin = binaryName(platformKey);
  const destBin = path.join(outDir, bin);

  if (fs.existsSync(destBin)) {
    console.log(`[lark-cli:fetch] skip existing ${platformKey}/${archKey}`);
    return destBin;
  }

  const tmpDir = fs.mkdtempSync(path.join(OUT_ROOT, '.tmp-'));
  const archivePath = path.join(tmpDir, archive);
  try {
    console.log(`[lark-cli:fetch] downloading ${url}`);
    download(url, archivePath);
    extractArchive(archivePath, tmpDir, platformKey);
    const extracted = path.join(tmpDir, bin);
    if (!fs.existsSync(extracted)) {
      throw new Error(`Binary not found after extract: ${extracted}`);
    }
    fs.mkdirSync(outDir, { recursive: true });
    fs.copyFileSync(extracted, destBin);
    if (platformKey !== 'windows') {
      fs.chmodSync(destBin, 0o755);
    }
    console.log(`[lark-cli:fetch] OK ${destBin}`);
    return destBin;
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

export function defaultHostPlatformArch() {
  const platformKey = PLATFORM_MAP[process.platform];
  const archKey = ARCH_MAP[process.arch];
  if (!platformKey || !archKey) {
    throw new Error(`Unsupported host ${process.platform}-${process.arch}`);
  }
  return { platformKey, archKey };
}

export const ALL_TARGETS = [
  { platformKey: 'windows', archKey: 'amd64' },
  { platformKey: 'darwin', archKey: 'amd64' },
  { platformKey: 'darwin', archKey: 'arm64' },
  { platformKey: 'linux', archKey: 'amd64' },
  { platformKey: 'linux', archKey: 'arm64' },
];
