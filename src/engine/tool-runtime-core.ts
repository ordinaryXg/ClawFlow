import type { ToolSchema, ToolCall } from './providers/types';
import type { ResolvedClawFlowWebSearch } from './web-search';
import * as path from 'path';
import * as fs from 'fs';
import { createHash } from 'crypto';
import type { WorkspaceToolId } from '../shared/workspace-tools';
import { toolNameAllowedByWorkspaceManifest } from '../shared/workspace-tool-manifest-bridge';
import { broadcastWorkspaceFilesUpdated } from '../main/workspace/workspace-files-broadcast';
import { isHermesMemoryRel } from './hermes-memory-store';
import * as workspaceExplorer from '../main/workspace/workspace-explorer';
import { clawflowDir } from '../main/workspace/workspace-service';

export function notifyWorkspaceTreeChanged(workspaceRoot: string): void {
  broadcastWorkspaceFilesUpdated(workspaceRoot);
}

export function isBlockedHermesMemoryDiskWrite(rel: string): boolean {
  const n = String(rel ?? '').replace(/\\/g, '/').replace(/^\/+/, '');
  if (isHermesMemoryRel(n)) return true;
  if (n === '.agent/.memory' || n.startsWith('.agent/.memory/')) return true;
  if (n === '.agent/.hermes/notes' || n.startsWith('.agent/.hermes/notes/')) return true;
  return false;
}

export type ToolExecutionContext = {
  workspaceRoot: string;
  config?: { verbose?: boolean; webSearch?: ResolvedClawFlowWebSearch };
  /** Optional stream hook for tool progress (delta text) */
  onDelta?: (text: string) => void;
  /** Optional hook to persist tool lifecycle events */
  onToolEvent?: (ev: {
    phase: 'start' | 'done' | 'fail';
    tool_call_id: string;
    toolName: string;
    argumentsText: string;
    outputText?: string;
    ts: number;
    /** Optional override for UI status */
    statusOverride?: 'running' | 'success' | 'error' | 'result';
  }) => void | Promise<void>;
  /** ToolRuntime internal: current tool call id (for handlers needing async follow-up) */
  currentToolCallId?: string;
  /** Optional abort signal to cancel tool execution */
  abortSignal?: AbortSignal;
  /** 与 `.agent/.tool/manifest.json` 对齐；未传则不在此层校验（引擎应始终传入） */
  workspaceToolSelection?: Record<WorkspaceToolId, boolean>;
};

export type ToolResult = { tool_call_id: string; content: string };

type ToolHandler = (args: any, ctx: ToolExecutionContext) => Promise<string> | string;

type RegisteredTool = {
  schema: ToolSchema;
  handler: ToolHandler;
};

type JsonSchema =
  | {
      type: 'object';
      properties: Record<string, { type: string; items?: { type: string }; minimum?: number; maximum?: number }>;
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
    properties: Record<string, { type: string; items?: { type: string }; minimum?: number; maximum?: number }>;
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
    const val = (args as any)[k];
    const want = def?.type;
    if (!want) continue;
    if (want === 'array') {
      if (!Array.isArray(val)) {
        errs.push(`field ${k} type mismatch: expected array, got ${typeof val}`);
        continue;
      }
      const itemType = def.items?.type;
      if (itemType === 'string') {
        for (let i = 0; i < val.length; i++) {
          if (typeof val[i] !== 'string') errs.push(`field ${k}[${i}] must be string`);
        }
      }
      continue;
    }
    const got = typeof val;
    if (got !== want) errs.push(`field ${k} type mismatch: expected ${want}, got ${got}`);
    if (want === 'number' && got === 'number' && Number.isFinite(val)) {
      if (typeof def.minimum === 'number' && val < def.minimum) errs.push(`field ${k} below minimum ${def.minimum}`);
      if (typeof def.maximum === 'number' && val > def.maximum) errs.push(`field ${k} above maximum ${def.maximum}`);
    }
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

  // additionalProperties=false；required 仅列出必填字段（与 JSON Schema / web_search 一致）
  if ((params as any).additionalProperties !== false) {
    throw new Error(`Tool schema must set additionalProperties=false: ${(schema as any)?.function?.name ?? 'unknown'}`);
  }

  for (const k of required) {
    if (!(k in properties)) {
      throw new Error(
        `Tool schema required references unknown property "${k}": ${(schema as any)?.function?.name ?? 'unknown'}`
      );
    }
  }
}

export function truncateForToolLog(text: string, maxChars = 800): string {
  const s = String(text ?? '').trim();
  if (!s) return '';
  if (s.length <= maxChars) return s;
  return `${s.slice(0, maxChars)}\n... (truncated ${s.length - maxChars} chars) ...`;
}

export function normalizePathForCompare(p: string): string {
  const s = String(p ?? '');
  return process.platform === 'win32' ? s.toLowerCase() : s;
}

export async function assertNoExistingPathAliases(params: { rootPath: string; candidatePath: string }): Promise<void> {
  const rootResolved = path.resolve(params.rootPath);
  const candidateResolved = path.resolve(params.candidatePath);
  const relative = path.relative(rootResolved, candidateResolved);
  if (!relative || relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) return;

  let current = rootResolved;
  for (const segment of relative.split(path.sep)) {
    if (!segment) continue;
    current = path.join(current, segment);
    const st = await fs.promises.lstat(current).catch((e: any) => {
      if (e?.code === 'ENOENT') return null;
      throw e;
    });
    if (!st) return;
    if (st.isSymbolicLink()) {
      throw new Error(`Path alias under workspace root: ${path.relative(rootResolved, current)}`);
    }
  }
}

export async function assertResolvedPathStillInsideRoot(params: { rootPath: string; resolvedPath: string }): Promise<void> {
  const rootReal = await fs.promises.realpath(path.resolve(params.rootPath));
  const resolvedReal = await fs.promises.realpath(path.resolve(params.resolvedPath));
  const rootCmp = normalizePathForCompare(rootReal.endsWith(path.sep) ? rootReal : rootReal + path.sep);
  const targetCmp = normalizePathForCompare(resolvedReal);
  if (!targetCmp.startsWith(rootCmp)) throw new Error('Path escapes workspace (alias resolution)');
}

export async function resolveRealPathInsideWorkspace(workspaceRoot: string, relativePath: string): Promise<string> {
  const full = workspaceExplorer.resolvePathInsideWorkspace(workspaceRoot, relativePath);
  const rootReal = await fs.promises.realpath(path.resolve(workspaceRoot));
  // realpath throws if missing; for new files we validate the parent dir instead
  const parentReal = await fs.promises.realpath(path.dirname(full));
  const rootCmp = normalizePathForCompare(rootReal.endsWith(path.sep) ? rootReal : rootReal + path.sep);
  const parentCmp = normalizePathForCompare(parentReal.endsWith(path.sep) ? parentReal : parentReal + path.sep);
  if (!parentCmp.startsWith(rootCmp)) throw new Error('Path escapes workspace');
  // additionally prevent symlink segments inside workspace root
  await assertNoExistingPathAliases({ rootPath: workspaceRoot, candidatePath: path.dirname(full) });
  return full;
}

export function sha256(text: string): string {
  return createHash('sha256').update(String(text ?? ''), 'utf8').digest('hex').slice(0, 12);
}

export function sanitizeRelForOp(rel: string): string {
  return String(rel ?? '')
    .replace(/^[./\\]+/g, '')
    .replace(/[:*?"<>|]/g, '_')
    .replace(/[/\\]+/g, '/')
    .replace(/\.\.(\/|\\)/g, '__/');
}

type OpMeta =
  | {
      version: 1;
      id: string;
      ts: number;
      kind: 'write_file' | 'apply_patch' | 'delete_path' | 'rename_path' | 'mkdir';
      relativePath: string;
      details?: Record<string, unknown>;
      rollback: { available: boolean; hint?: string };
    };

export async function writeOpRecord(workspaceRoot: string, meta: OpMeta, files?: Record<string, string | Buffer>): Promise<void> {
  const dir = path.join(clawflowDir(workspaceRoot), 'ops', meta.id);
  await fs.promises.mkdir(dir, { recursive: true });
  await fs.promises.writeFile(path.join(dir, 'meta.json'), JSON.stringify(meta, null, 2), 'utf8');
  if (files) {
    for (const [name, content] of Object.entries(files)) {
      const p = path.join(dir, name);
      await fs.promises.mkdir(path.dirname(p), { recursive: true });
      if (Buffer.isBuffer(content)) await fs.promises.writeFile(p, content);
      else await fs.promises.writeFile(p, String(content ?? ''), 'utf8');
    }
  }
}

export async function readOpMeta(workspaceRoot: string, opId: string): Promise<OpMeta> {
  const p = path.join(clawflowDir(workspaceRoot), 'ops', opId, 'meta.json');
  const raw = await fs.promises.readFile(p, 'utf8');
  const parsed = JSON.parse(raw);
  return parsed as OpMeta;
}

export function confirmRequiredMessage(op: string): string {
  return `CONFIRM_REQUIRED: ${op}. Re-run the tool call with "confirm": true if you really want to proceed.`;
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
        for (const rest of calls.slice(results.length)) {
          results.push({
            tool_call_id: rest.id,
            content: 'Tool execution cancelled',
          });
        }
        return results;
      }
      const name = call?.function?.name;
      const entry = name ? this.tools.get(name) : null;
      if (!entry) {
        results.push({ tool_call_id: call.id, content: `Tool not found: ${name}` });
        continue;
      }
      if (ctx.workspaceToolSelection && !toolNameAllowedByWorkspaceManifest(name, ctx.workspaceToolSelection)) {
        results.push({
          tool_call_id: call.id,
          content: `Workspace capability disabled for tool "${name}". Enable it in workspace settings (writes .agent/.tool/manifest.json).`,
        });
        continue;
      }
      let args: any = {};
      const rawArgsText = typeof call?.function?.arguments === 'string' ? call.function.arguments : '';
      ctx.currentToolCallId = call.id;
      try {
        args = rawArgsText ? JSON.parse(rawArgsText) : {};
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
        await ctx.onToolEvent?.({
          phase: 'start',
          tool_call_id: call.id,
          toolName: String(name ?? 'unknown'),
          argumentsText: rawArgsText,
          ts: Date.now(),
        });
        const out = await entry.handler(args, ctx);
        const content = typeof out === 'string' ? out : JSON.stringify(out);
        results.push({ tool_call_id: call.id, content });
        const n = String(name ?? '');
        /** 读文件类：不在流式对话区注入正文摘要，避免大段内容刷屏；完整输出仅在工具卡片展开区展示 */
        const omitStreamBody =
          n === 'workspace_read_file' || n === 'workspace_read_file_preview';
        const summary = omitStreamBody ? '' : truncateForToolLog(content, 320);
        ctx.onDelta?.(`[tool:done] ${name}${summary ? `\n${summary}\n` : '\n'}`);
        const isAsyncReceipt = false;
        await ctx.onToolEvent?.({
          phase: 'done',
          tool_call_id: call.id,
          toolName: String(name ?? 'unknown'),
          argumentsText: rawArgsText,
          outputText: content,
          ts: Date.now(),
          ...(isAsyncReceipt ? { statusOverride: 'running' } : {}),
        });
      } catch (e: any) {
        const msg = `Tool error: ${e?.message ?? String(e)}`;
        results.push({ tool_call_id: call.id, content: msg });
        ctx.onDelta?.(`[tool:fail] ${name}\n${truncateForToolLog(msg, 320)}\n`);
        await ctx.onToolEvent?.({
          phase: 'fail',
          tool_call_id: call.id,
          toolName: String(name ?? 'unknown'),
          argumentsText: rawArgsText,
          outputText: msg,
          ts: Date.now(),
        });
      }
    }
    return results;
  }
}
