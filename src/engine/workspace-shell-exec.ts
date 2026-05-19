import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import * as workspaceExplorer from '../main/workspace/workspace-explorer';

const execAsync = promisify(exec);

export const WORKSPACE_SHELL_DEFAULT_TIMEOUT_MS = 60_000;
export const WORKSPACE_SHELL_MAX_TIMEOUT_MS = 120_000;
export const WORKSPACE_SHELL_MAX_OUTPUT_CHARS = 24_000;
const MAX_COMMAND_CHARS = 8_000;
const MAX_BUFFER_BYTES = 4 * 1024 * 1024;

function normalizePathForCompare(p: string): string {
  const s = path.resolve(String(p ?? ''));
  return process.platform === 'win32' ? s.toLowerCase() : s;
}

function isPathInsideWorkspaceRoot(workspaceRoot: string, targetAbs: string): boolean {
  const root = normalizePathForCompare(workspaceRoot);
  const target = normalizePathForCompare(targetAbs);
  const rootPrefix = root.endsWith(path.sep) ? root : `${root}${path.sep}`;
  return target === root || target.startsWith(rootPrefix);
}

export function validateShellCommand(command: string): string | null {
  const cmd = String(command ?? '').trim();
  if (!cmd) return 'command is required';
  if (cmd.includes('\0')) return 'command contains invalid characters';
  if (cmd.length > MAX_COMMAND_CHARS) return `command exceeds ${MAX_COMMAND_CHARS} characters`;
  return null;
}

export function clampShellTimeoutMs(timeoutMs?: number): number {
  const n = typeof timeoutMs === 'number' && Number.isFinite(timeoutMs) ? Math.floor(timeoutMs) : WORKSPACE_SHELL_DEFAULT_TIMEOUT_MS;
  return Math.min(Math.max(n, 1_000), WORKSPACE_SHELL_MAX_TIMEOUT_MS);
}

/** Resolve a cwd under workspace root; validates escape when the directory exists. */
export async function resolveShellCwd(workspaceRoot: string, cwdRelative: string): Promise<string> {
  const rel = String(cwdRelative ?? '').trim();
  const full = rel
    ? workspaceExplorer.resolvePathInsideWorkspace(workspaceRoot, rel)
    : path.resolve(workspaceRoot);
  if (!isPathInsideWorkspaceRoot(workspaceRoot, full)) {
    throw new Error('cwd escapes workspace');
  }
  try {
    const st = await fs.promises.stat(full);
    if (!st.isDirectory()) throw new Error('cwd is not a directory');
    const rootReal = await fs.promises.realpath(path.resolve(workspaceRoot));
    const dirReal = await fs.promises.realpath(full);
    if (!isPathInsideWorkspaceRoot(rootReal, dirReal)) {
      throw new Error('cwd escapes workspace (symlink resolution)');
    }
  } catch (e: any) {
    if (e?.code === 'ENOENT') {
      throw new Error(`cwd does not exist: ${rel || '.'}`);
    }
    throw e;
  }
  return full;
}

function truncateShellOutput(text: string, maxChars = WORKSPACE_SHELL_MAX_OUTPUT_CHARS): string {
  const s = String(text ?? '').trimEnd();
  if (s.length <= maxChars) return s;
  return `${s.slice(0, maxChars)}\n... (truncated ${s.length - maxChars} chars) ...`;
}

export type RunWorkspaceShellParams = {
  workspaceRoot: string;
  command: string;
  cwdRelative: string;
  timeoutMs?: number;
  abortSignal?: AbortSignal;
};

/**
 * Run a shell command with cwd confined to the workspace. Uses the platform shell
 * (`cmd.exe` on Windows, `/bin/sh` elsewhere).
 */
export async function runWorkspaceShellCommand(params: RunWorkspaceShellParams): Promise<string> {
  const err = validateShellCommand(params.command);
  if (err) return `ERROR: ${err}`;

  const timeoutMs = clampShellTimeoutMs(params.timeoutMs);
  let cwd: string;
  try {
    cwd = await resolveShellCwd(params.workspaceRoot, params.cwdRelative);
  } catch (e: any) {
    return `ERROR: ${e?.message ?? String(e)}`;
  }

  try {
    const execOptions: {
      cwd: string;
      timeout: number;
      maxBuffer: number;
      windowsHide: boolean;
      env: NodeJS.ProcessEnv;
      shell: string;
      signal?: AbortSignal;
    } = {
      cwd,
      timeout: timeoutMs,
      maxBuffer: MAX_BUFFER_BYTES,
      windowsHide: true,
      env: process.env,
      shell: process.platform === 'win32' ? (process.env.ComSpec ?? 'cmd.exe') : '/bin/sh',
    };
    if (params.abortSignal) {
      execOptions.signal = params.abortSignal;
    }
    const { stdout, stderr } = await execAsync(params.command.trim(), execOptions);
    const combined = [stdout, stderr].filter(Boolean).join('\n');
    const exitHint = combined.trim() ? combined : '(no output)';
    return truncateShellOutput(exitHint);
  } catch (e: any) {
    const stdout = String(e?.stdout ?? '');
    const stderr = String(e?.stderr ?? '');
    const code = e?.code;
    const killed = e?.killed === true;
    const msg = String(e?.message ?? e);
    const combined = [stdout, stderr].filter(Boolean).join('\n').trimEnd();
    const header = killed
      ? `ERROR: command timed out or was aborted (${msg})`
      : `ERROR: command failed (code=${code ?? 'unknown'}): ${msg}`;
    const body = combined ? `${header}\n${combined}` : header;
    return truncateShellOutput(body);
  }
}
