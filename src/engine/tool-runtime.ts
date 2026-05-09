import type { ToolSchema, ToolCall } from './providers/types';
import * as workspaceExplorer from '../workspace-explorer';
import type { ClawFlowEngineConfig } from './clawflow-engine';
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';

export type ToolExecutionContext = {
  workspaceRoot: string;
  config?: ClawFlowEngineConfig;
  /** Optional stream hook for tool progress (delta text) */
  onDelta?: (text: string) => void;
  /** Optional abort signal to cancel tool execution */
  abortSignal?: AbortSignal;
};

export type ToolResult = { tool_call_id: string; content: string };

type ToolHandler = (args: any, ctx: ToolExecutionContext) => Promise<string> | string;

type RegisteredTool = {
  schema: ToolSchema;
  handler: ToolHandler;
};

const execFileAsync = promisify(execFile);

type JsonSchema =
  | {
      type: 'object';
      properties: Record<string, { type: 'string' | 'number' | 'boolean' }>;
      required: string[];
      additionalProperties: false;
    }
  | Record<string, unknown>;

function validateStrictArgs(schema: JsonSchema | undefined, args: any): string[] {
  const errs: string[] = [];
  if (!schema || typeof schema !== 'object') return errs;
  if ((schema as any).type !== 'object') return errs;

  const s = schema as {
    type: 'object';
    properties: Record<string, { type: 'string' | 'number' | 'boolean' }>;
    required: string[];
    additionalProperties: false;
  };

  if (!args || typeof args !== 'object' || Array.isArray(args)) {
    errs.push('args must be an object');
    return errs;
  }

  const props = s.properties ?? {};
  const req = Array.isArray(s.required) ? s.required : [];

  for (const k of req) {
    if (!(k in args)) errs.push(`missing required field: ${k}`);
  }

  const allowExtra = Boolean((s as any).additionalProperties);
  if (!allowExtra) {
    for (const k of Object.keys(args)) {
      if (!(k in props)) errs.push(`unexpected field: ${k}`);
    }
  }

  for (const [k, def] of Object.entries(props)) {
    if (!(k in args)) continue;
    const want = def?.type;
    if (!want) continue;
    const got = typeof (args as any)[k];
    if (got !== want) errs.push(`field ${k} type mismatch: expected ${want}, got ${got}`);
  }

  return errs;
}

function assertStrictSchema(schema: ToolSchema): void {
  const params = (schema as any)?.function?.parameters as JsonSchema | undefined;
  if (!params || typeof params !== 'object') return;
  if ((params as any).type !== 'object') return;

  const required = Array.isArray((params as any).required) ? ((params as any).required as string[]) : [];
  const properties =
    (params as any).properties && typeof (params as any).properties === 'object' ? (params as any).properties : {};

  // enforce strict mode for our tools: additionalProperties=false + required lists all properties
  if ((params as any).additionalProperties !== false) {
    throw new Error(`Tool schema must set additionalProperties=false: ${(schema as any)?.function?.name ?? 'unknown'}`);
  }

  const propKeys = Object.keys(properties);
  const missingInRequired = propKeys.filter((k) => !required.includes(k));
  if (missingInRequired.length) {
    throw new Error(
      `Tool schema required must include all properties (${missingInRequired.join(', ')}): ${(schema as any)?.function?.name ?? 'unknown'}`
    );
  }
}

function truncateForToolLog(text: string, maxChars = 800): string {
  const s = String(text ?? '').trim();
  if (!s) return '';
  if (s.length <= maxChars) return s;
  return `${s.slice(0, maxChars)}\n... (truncated ${s.length - maxChars} chars) ...`;
}

export class ToolRuntime {
  private tools = new Map<string, RegisteredTool>();

  register(schema: ToolSchema, handler: ToolHandler): void {
    assertStrictSchema(schema);
    this.tools.set(schema.function.name, { schema, handler });
  }

  listSchemas(): ToolSchema[] {
    return Array.from(this.tools.values()).map((t) => t.schema);
  }

  async executeToolCalls(calls: ToolCall[], ctx: ToolExecutionContext): Promise<ToolResult[]> {
    const results: ToolResult[] = [];
    for (const call of calls) {
      if (ctx.abortSignal?.aborted) {
        results.push({ tool_call_id: call.id, content: 'Tool execution cancelled' });
        break;
      }
      const name = call?.function?.name;
      const entry = name ? this.tools.get(name) : null;
      if (!entry) {
        results.push({ tool_call_id: call.id, content: `Tool not found: ${name}` });
        continue;
      }
      let args: any = {};
      try {
        args = call.function.arguments ? JSON.parse(call.function.arguments) : {};
      } catch {
        args = {};
      }
      const schemaErrs = validateStrictArgs(entry.schema.function.parameters as any, args);
      if (schemaErrs.length) {
        results.push({
          tool_call_id: call.id,
          content: `Tool args validation failed: ${schemaErrs.join('; ')}`,
        });
        continue;
      }
      try {
        ctx.onDelta?.(`\n[tool:start] ${name}\n`);
        const out = await entry.handler(args, ctx);
        const content = typeof out === 'string' ? out : JSON.stringify(out);
        results.push({ tool_call_id: call.id, content });
        const summary = truncateForToolLog(content, 320);
        ctx.onDelta?.(`[tool:done] ${name}${summary ? `\n${summary}\n` : '\n'}`);
      } catch (e: any) {
        const msg = `Tool error: ${e?.message ?? String(e)}`;
        results.push({ tool_call_id: call.id, content: msg });
        ctx.onDelta?.(`[tool:fail] ${name}\n${truncateForToolLog(msg, 320)}\n`);
      }
    }
    return results;
  }
}

export function createDefaultToolRuntime(): ToolRuntime {
  const rt = new ToolRuntime();

  rt.register(
    {
      type: 'function',
      function: {
        name: 'get_date',
        description: 'Get current date in YYYY-MM-DD',
        strict: true,
        parameters: {
          type: 'object',
          properties: {},
          required: [],
          additionalProperties: false,
        },
      },
    },
    async () => {
      const d = new Date();
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      return `${yyyy}-${mm}-${dd}`;
    }
  );

  rt.register(
    {
      type: 'function',
      function: {
        name: 'workspace_list_dir',
        description: 'List entries under workspace relative path',
        strict: true,
        parameters: {
          type: 'object',
          properties: {
            relativePath: { type: 'string', description: 'Relative path under workspace root (default: empty)' },
          },
          required: ['relativePath'],
          additionalProperties: false,
        },
      },
    },
    async (args, ctx) => {
      const rel = String(args?.relativePath ?? '');
      try {
        const entries = await workspaceExplorer.listWorkspaceDirectory(ctx.workspaceRoot, rel);
        return JSON.stringify(entries, null, 2);
      } catch (e: any) {
        return `ERROR: ${e?.message ?? 'list failed'}`;
      }
    }
  );

  rt.register(
    {
      type: 'function',
      function: {
        name: 'workspace_read_file_preview',
        description: 'Read a file preview under workspace relative path',
        strict: true,
        parameters: {
          type: 'object',
          properties: {
            relativePath: { type: 'string', description: 'Relative path under workspace root' },
          },
          required: ['relativePath'],
          additionalProperties: false,
        },
      },
    },
    async (args, ctx) => {
      const rel = String(args?.relativePath ?? '');
      const res = await workspaceExplorer.readWorkspaceFilePreview(ctx.workspaceRoot, rel);
      if (!res.ok) return `ERROR: ${res.error ?? 'read failed'}`;
      if (res.isImage) return `IMAGE:${res.mimeType ?? 'image'}:${res.content.slice(0, 120)}`;
      if (res.isBinary) return 'BINARY_FILE';
      return res.content;
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

  return rt;
}

