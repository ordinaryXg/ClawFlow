import { execFile } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import type { ToolRuntime } from '../tool-runtime-core';
import { truncateForToolLog } from '../tool-runtime-core';
import { runWorkspaceShellCommand } from '../workspace-shell-exec';

const execFileAsync = promisify(execFile);

export function registerWorkspaceShellGitTools(rt: ToolRuntime): void {
  rt.register(
    {
      type: 'function',
      function: {
        name: 'workspace_run_shell',
        description:
          'Run a shell command inside the workspace (cwd must be under workspace root). Returns combined stdout/stderr. High-risk: requires user approval in Plan/Multitask.',
        strict: true,
        parameters: {
          type: 'object',
          properties: {
            command: { type: 'string', description: 'Shell command line to execute' },
            cwdRelative: {
              type: 'string',
              description: 'Relative working directory under workspace root (empty string = workspace root; must exist)',
            },
            timeoutMs: {
              type: 'number',
              description: 'Timeout in milliseconds (default 60000, max 120000)',
              minimum: 1000,
              maximum: 120000,
            },
          },
          required: ['command', 'cwdRelative'],
          additionalProperties: false,
        },
      },
    },
    async (args, ctx) => {
      const command = String(args?.command ?? '');
      const cwdRelative = String(args?.cwdRelative ?? '');
      const timeoutMs = typeof args?.timeoutMs === 'number' ? args.timeoutMs : undefined;
      return runWorkspaceShellCommand({
        workspaceRoot: ctx.workspaceRoot,
        command,
        cwdRelative,
        timeoutMs,
        abortSignal: ctx.abortSignal,
      });
    }
  );

  rt.register(
    {
      type: 'function',
      function: {
        name: 'workspace_run_tsc_no_emit',
        description: 'Run TypeScript compiler (tsc) with --noEmit under workspace root and return output',
        strict: true,
        parameters: {
          type: 'object',
          properties: {
            cwdRelative: { type: 'string', description: 'Relative working directory under workspace root (default: empty)' },
          },
          required: ['cwdRelative'],
          additionalProperties: false,
        },
      },
    },
    async (args, ctx) => {
      const rel = String(args?.cwdRelative ?? '');
      const cwd = rel ? path.join(ctx.workspaceRoot, rel) : ctx.workspaceRoot;
      const timeoutMs = 60_000;
      try {
        const { stdout, stderr } = await execFileAsync('npx', ['tsc', '--noEmit'], {
          cwd,
          timeout: timeoutMs,
          windowsHide: true,
          env: process.env,
          ...(ctx.abortSignal ? { signal: ctx.abortSignal as any } : {}),
        });
        const out = [stdout, stderr].filter(Boolean).join('\n').trim();
        return out || 'OK';
      } catch (e: any) {
        const stdout = String(e?.stdout ?? '');
        const stderr = String(e?.stderr ?? '');
        const msg = String(e?.message ?? e);
        const out = [stdout, stderr].filter(Boolean).join('\n').trim();
        return `ERROR: ${msg}\n${out}`.trim();
      }
    }
  );

  rt.register(
    {
      type: 'function',
      function: {
        name: 'workspace_git_status',
        description: 'Run git status --porcelain under workspace root and return output',
        strict: true,
        parameters: {
          type: 'object',
          properties: {
            cwdRelative: { type: 'string', description: 'Relative working directory under workspace root (default: empty)' },
          },
          required: ['cwdRelative'],
          additionalProperties: false,
        },
      },
    },
    async (args, ctx) => {
      const rel = String(args?.cwdRelative ?? '');
      const cwd = rel ? path.join(ctx.workspaceRoot, rel) : ctx.workspaceRoot;
      const timeoutMs = 20_000;
      try {
        const { stdout, stderr } = await execFileAsync('git', ['status', '--porcelain'], {
          cwd,
          timeout: timeoutMs,
          windowsHide: true,
          env: process.env,
          ...(ctx.abortSignal ? { signal: ctx.abortSignal as any } : {}),
        });
        const out = [stdout, stderr].filter(Boolean).join('\n').trim();
        return out || '(clean)';
      } catch (e: any) {
        const stdout = String(e?.stdout ?? '');
        const stderr = String(e?.stderr ?? '');
        const msg = String(e?.message ?? e);
        const out = [stdout, stderr].filter(Boolean).join('\n').trim();
        return `ERROR: ${msg}\n${out}`.trim();
      }
    }
  );

  rt.register(
    {
      type: 'function',
      function: {
        name: 'workspace_git_diff',
        description: 'Run git diff under workspace root and return output',
        strict: true,
        parameters: {
          type: 'object',
          properties: {
            cwdRelative: { type: 'string', description: 'Relative working directory under workspace root (default: empty)' },
            staged: { type: 'boolean', description: 'If true, run git diff --staged' },
          },
          required: ['cwdRelative', 'staged'],
          additionalProperties: false,
        },
      },
    },
    async (args, ctx) => {
      const rel = String(args?.cwdRelative ?? '');
      const staged = Boolean(args?.staged);
      const cwd = rel ? path.join(ctx.workspaceRoot, rel) : ctx.workspaceRoot;
      const timeoutMs = 20_000;
      try {
        const argv = staged ? ['diff', '--staged'] : ['diff'];
        const { stdout, stderr } = await execFileAsync('git', argv, {
          cwd,
          timeout: timeoutMs,
          windowsHide: true,
          env: process.env,
          ...(ctx.abortSignal ? { signal: ctx.abortSignal as any } : {}),
        });
        const out = [stdout, stderr].filter(Boolean).join('\n').trim();
        return truncateForToolLog(out || '(no diff)', 6000);
      } catch (e: any) {
        const stdout = String(e?.stdout ?? '');
        const stderr = String(e?.stderr ?? '');
        const msg = String(e?.message ?? e);
        const out = [stdout, stderr].filter(Boolean).join('\n').trim();
        return truncateForToolLog(`ERROR: ${msg}\n${out}`.trim(), 6000);
      }
    }
  );

  rt.register(
    {
      type: 'function',
      function: {
        name: 'workspace_git_log',
        description: 'Run git log --oneline under workspace root and return output',
        strict: true,
        parameters: {
          type: 'object',
          properties: {
            cwdRelative: { type: 'string', description: 'Relative working directory under workspace root (default: empty)' },
            maxCount: { type: 'number', description: 'Max commits to show (e.g. 10)' },
          },
          required: ['cwdRelative', 'maxCount'],
          additionalProperties: false,
        },
      },
    },
    async (args, ctx) => {
      const rel = String(args?.cwdRelative ?? '');
      const maxCount = Number(args?.maxCount ?? 10);
      const n = Number.isFinite(maxCount) ? Math.max(1, Math.min(50, Math.floor(maxCount))) : 10;
      const cwd = rel ? path.join(ctx.workspaceRoot, rel) : ctx.workspaceRoot;
      const timeoutMs = 20_000;
      try {
        const { stdout, stderr } = await execFileAsync('git', ['log', `-n`, String(n), '--oneline'], {
          cwd,
          timeout: timeoutMs,
          windowsHide: true,
          env: process.env,
          ...(ctx.abortSignal ? { signal: ctx.abortSignal as any } : {}),
        });
        const out = [stdout, stderr].filter(Boolean).join('\n').trim();
        return out || '(empty)';
      } catch (e: any) {
        const stdout = String(e?.stdout ?? '');
        const stderr = String(e?.stderr ?? '');
        const msg = String(e?.message ?? e);
        const out = [stdout, stderr].filter(Boolean).join('\n').trim();
        return `ERROR: ${msg}\n${truncateForToolLog(out, 2000)}`.trim();
      }
    }
  );

  rt.register(
    {
      type: 'function',
      function: {
        name: 'workspace_rg_search',
        description: 'Search workspace files using ripgrep (rg) and return matches',
        strict: true,
        parameters: {
          type: 'object',
          properties: {
            cwdRelative: { type: 'string', description: 'Relative working directory under workspace root (default: empty)' },
            pattern: { type: 'string', description: 'Ripgrep pattern (regex)' },
            glob: { type: 'string', description: 'Optional rg --glob filter, empty means no glob' },
          },
          required: ['cwdRelative', 'pattern', 'glob'],
          additionalProperties: false,
        },
      },
    },
    async (args, ctx) => {
      const rel = String(args?.cwdRelative ?? '');
      const pattern = String(args?.pattern ?? '').trim();
      const glob = String(args?.glob ?? '').trim();
      if (!pattern) return 'ERROR: missing pattern';
      const cwd = rel ? path.join(ctx.workspaceRoot, rel) : ctx.workspaceRoot;
      const timeoutMs = 25_000;
      try {
        const argv = ['-n', '--max-columns', '200', '--max-count', '80'];
        if (glob) argv.push('--glob', glob);
        argv.push(pattern);
        const { stdout, stderr } = await execFileAsync('rg', argv, {
          cwd,
          timeout: timeoutMs,
          windowsHide: true,
          env: process.env,
          ...(ctx.abortSignal ? { signal: ctx.abortSignal as any } : {}),
        });
        const out = [stdout, stderr].filter(Boolean).join('\n').trim();
        return truncateForToolLog(out || '(no matches)', 6000);
      } catch (e: any) {
        // rg exits with 1 when no matches; treat that as empty results rather than an error
        const code = typeof e?.code === 'number' ? e.code : null;
        const stdout = String(e?.stdout ?? '');
        const stderr = String(e?.stderr ?? '');
        const out = [stdout, stderr].filter(Boolean).join('\n').trim();
        if (code === 1 && !out) return '(no matches)';
        const msg = String(e?.message ?? e);
        return truncateForToolLog(`ERROR: ${msg}\n${out}`.trim(), 6000);
      }
    }
  );
}
