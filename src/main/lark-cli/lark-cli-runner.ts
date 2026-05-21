import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';
import { fetchWithProxyRetry } from '../../utils/net-fetch';
import { buildLarkCliEnv } from './lark-cli-env';
import { extractConfirmationRequired, extractLarkCliFailureMessage, findLarkCliJsonInOutput, LarkCliError, tryParseLarkCliJson } from './lark-cli-errors';
import { getInstalledLarkCliBinaryPath, getLarkCliBinDir, resolveLarkCliBinaryPath } from './lark-cli-path';
import { LARK_CLI_GITHUB_REPO, LARK_CLI_PACKAGE_VERSION } from './lark-cli-version';

export type LarkCliRunResult = {
  ok: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
  json?: unknown;
  confirmationRequired?: ReturnType<typeof extractConfirmationRequired>;
};

function platformArchiveName(): string {
  const platform =
    process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'darwin' : 'linux';
  const arch = process.arch === 'arm64' ? 'arm64' : 'amd64';
  const ext = process.platform === 'win32' ? '.zip' : '.tar.gz';
  return `lark-cli-${LARK_CLI_PACKAGE_VERSION}-${platform}-${arch}${ext}`;
}

async function downloadToFile(url: string, destPath: string): Promise<void> {
  const res = await fetchWithProxyRetry(url, { method: 'GET' }, { timeoutMs: 120_000, retries: 1 });
  if (!res.ok) throw new Error(`download failed HTTP ${res.status} ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await fs.promises.mkdir(path.dirname(destPath), { recursive: true });
  await fs.promises.writeFile(destPath, buf);
}

async function extractArchive(archivePath: string, destDir: string): Promise<void> {
  await fs.promises.mkdir(destDir, { recursive: true });
  if (archivePath.endsWith('.zip')) {
    const { execFile } = await import('child_process');
    const { promisify } = await import('util');
    const execFileAsync = promisify(execFile);
    await execFileAsync('tar', ['-xf', archivePath, '-C', destDir], { windowsHide: true });
    return;
  }
  const { execFile } = await import('child_process');
  const { promisify } = await import('util');
  const execFileAsync = promisify(execFile);
  await execFileAsync('tar', ['-xzf', archivePath, '-C', destDir], { windowsHide: true });
}

export async function ensureLarkCliBinaryInstalled(): Promise<string> {
  const resolved = resolveLarkCliBinaryPath();
  if (resolved.path) return resolved.path;

  const binDir = getLarkCliBinDir();
  await fs.promises.mkdir(binDir, { recursive: true });
  const archive = platformArchiveName();
  const url = `https://github.com/${LARK_CLI_GITHUB_REPO}/releases/download/v${LARK_CLI_PACKAGE_VERSION}/${archive}`;
  const tmpDir = path.join(binDir, '.download-tmp');
  const archivePath = path.join(tmpDir, archive);
  await fs.promises.mkdir(tmpDir, { recursive: true });
  try {
    await downloadToFile(url, archivePath);
    await extractArchive(archivePath, tmpDir);
    const binName = process.platform === 'win32' ? 'lark-cli.exe' : 'lark-cli';
    const extracted = path.join(tmpDir, binName);
    const dest = getInstalledLarkCliBinaryPath();
    await fs.promises.copyFile(extracted, dest);
    if (process.platform !== 'win32') {
      await fs.promises.chmod(dest, 0o755);
    }
    return dest;
  } finally {
    await fs.promises.rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

export async function getLarkCliRuntimeStatus(): Promise<{
  installed: boolean;
  binaryPath: string | null;
  version: string;
  source: 'userData' | 'bundled-packaged' | 'bundled-dev' | 'remote' | null;
}> {
  let resolved = resolveLarkCliBinaryPath();
  if (resolved.path) {
    return {
      installed: true,
      binaryPath: resolved.path,
      version: LARK_CLI_PACKAGE_VERSION,
      source: resolved.source,
    };
  }
  try {
    const binaryPath = await ensureLarkCliBinaryInstalled();
    return {
      installed: Boolean(binaryPath),
      binaryPath,
      version: LARK_CLI_PACKAGE_VERSION,
      source: 'remote',
    };
  } catch {
    return {
      installed: false,
      binaryPath: null,
      version: LARK_CLI_PACKAGE_VERSION,
      source: null,
    };
  }
}

export async function runLarkCli(
  argv: string[],
  opts?: { timeoutMs?: number; stdin?: string; env?: NodeJS.ProcessEnv }
): Promise<LarkCliRunResult> {
  const binaryPath = await ensureLarkCliBinaryInstalled();
  const timeoutMs = opts?.timeoutMs ?? 120_000;
  const env = buildLarkCliEnv(opts?.env);

  return new Promise((resolve, reject) => {
    const child = spawn(binaryPath, argv, {
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (c: Buffer) => {
      stdout += c.toString('utf8');
    });
    child.stderr?.on('data', (c: Buffer) => {
      stderr += c.toString('utf8');
    });

    const timer = setTimeout(() => {
      try {
        child.kill('SIGTERM');
      } catch {
        /* ignore */
      }
    }, timeoutMs);

    child.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      const exitCode = code ?? 1;
      const json = findLarkCliJsonInOutput(stdout, stderr) ?? tryParseLarkCliJson(stdout.trim() || stderr.trim());
      const confirmationRequired = extractConfirmationRequired(stderr, exitCode);
      const ok =
        exitCode === 0 &&
        !(json && typeof json === 'object' && (json as Record<string, unknown>).ok === false);
      resolve({ ok, exitCode, stdout, stderr, json, confirmationRequired });
    });

    if (opts?.stdin) {
      child.stdin?.write(opts.stdin);
    }
    child.stdin?.end();
  });
}

export async function runLarkCliOrThrow(argv: string[], opts?: { timeoutMs?: number; stdin?: string }): Promise<LarkCliRunResult> {
  const res = await runLarkCli(argv, opts);
  if (res.ok) return res;
  const msg =
    res.confirmationRequired?.message ||
    extractLarkCliFailureMessage(res);
  throw new LarkCliError(msg, {
    exitCode: res.exitCode,
    stdout: res.stdout,
    stderr: res.stderr,
    parsed: res.json,
    confirmationRequired: res.confirmationRequired,
  });
}
