/**
 * Git 工作区：克隆 / 拉取 / 推送（主进程；非交互，依赖本机 git）。
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import { deriveRepoFolderNameFromGitUrl } from './shared/workspace-git-url';

const execFileAsync = promisify(execFile);

export { deriveRepoFolderNameFromGitUrl } from './shared/workspace-git-url';

export function validateGitRemoteUrl(url: string): { ok: true; normalized: string } | { ok: false; error: string } {
  const u = url.trim();
  if (!u) return { ok: false, error: 'empty_url' };
  if (/[\r\n\x00]/.test(u)) return { ok: false, error: 'invalid_url' };
  const lower = u.toLowerCase();
  if (
    lower.startsWith('https://') ||
    lower.startsWith('http://') ||
    lower.startsWith('git@') ||
    lower.startsWith('ssh://')
  ) {
    return { ok: true, normalized: u };
  }
  return { ok: false, error: 'unsupported_scheme' };
}

export async function gitCloneWorkspace(
  remoteUrl: string,
  parentDir: string
): Promise<{ ok: true; dest: string } | { ok: false; error: string }> {
  const v = validateGitRemoteUrl(remoteUrl);
  if (!v.ok) return v;
  const parent = path.resolve(parentDir);
  try {
    const st = await fs.promises.stat(parent);
    if (!st.isDirectory()) return { ok: false, error: 'parent_not_directory' };
  } catch {
    return { ok: false, error: 'parent_not_found' };
  }
  const folder = deriveRepoFolderNameFromGitUrl(v.normalized);
  const dest = path.join(parent, folder);
  try {
    await fs.promises.access(dest);
    return { ok: false, error: 'target_exists' };
  } catch {
    /* ok */
  }
  try {
    await execFileAsync('git', ['clone', v.normalized, dest], {
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
      maxBuffer: 10 * 1024 * 1024,
    });
  } catch (e: unknown) {
    try {
      await fs.promises.rm(dest, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
    const stderr = e && typeof e === 'object' && 'stderr' in e ? String((e as { stderr?: Buffer }).stderr ?? '') : '';
    const err = e instanceof Error ? e.message : String(e);
    return { ok: false, error: (stderr || err).slice(0, 1200) };
  }
  return { ok: true, dest };
}

export async function gitPullWorkspace(
  workspaceRoot: string
): Promise<{ ok: true; stdout: string } | { ok: false; error: string }> {
  const cwd = path.resolve(workspaceRoot);
  try {
    const r = await execFileAsync('git', ['pull'], {
      cwd,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
      maxBuffer: 10 * 1024 * 1024,
    });
    const out = [r.stdout?.toString() ?? '', r.stderr?.toString() ?? ''].join('\n').trim();
    return { ok: true, stdout: out };
  } catch (e: unknown) {
    const stderr = e && typeof e === 'object' && 'stderr' in e ? String((e as { stderr?: Buffer }).stderr ?? '') : '';
    const err = e instanceof Error ? e.message : String(e);
    return { ok: false, error: (stderr || err).slice(0, 1200) };
  }
}

export async function gitPushWorkspace(
  workspaceRoot: string
): Promise<{ ok: true; stdout: string } | { ok: false; error: string }> {
  const cwd = path.resolve(workspaceRoot);
  try {
    const r = await execFileAsync('git', ['push'], {
      cwd,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
      maxBuffer: 10 * 1024 * 1024,
    });
    const out = [r.stdout?.toString() ?? '', r.stderr?.toString() ?? ''].join('\n').trim();
    return { ok: true, stdout: out };
  } catch (e: unknown) {
    const stderr = e && typeof e === 'object' && 'stderr' in e ? String((e as { stderr?: Buffer }).stderr ?? '') : '';
    const err = e instanceof Error ? e.message : String(e);
    return { ok: false, error: (stderr || err).slice(0, 1200) };
  }
}
