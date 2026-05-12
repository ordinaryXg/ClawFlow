import { shell } from 'electron';
import type { ToolSchema, ToolCall } from './providers/types';
import { isSafeHttpUrl, normalizeHttpUrl } from '../utils/normalize-http-url';
import * as workspaceExplorer from '../workspace-explorer';
import { runClawFlowWebSearch, WEB_SEARCH_MAX_COUNT, type ResolvedClawFlowWebSearch } from './web-search';
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as fs from 'fs';
import { createHash, randomUUID } from 'crypto';
import { applyUpdateHunk, formatSummary, parsePatchText, type ApplyPatchSummary } from './openclaw-apply-patch';
import type { WorkspaceToolId } from '../shared/workspace-tools';
import { toolNameAllowedByWorkspaceManifest } from '../shared/workspace-tool-manifest-bridge';
import { runWebScrapeForTool } from '../scrape-runner';
import { readTodoTriggers, writeTodoTriggers, ensureScheduleNextFire } from '../todo-triggers-service';
import { rescheduleTodoTriggersForWorkspace } from '../todo-triggers-scheduler';
import { broadcastTodoTriggersUpdated } from '../todo-triggers-broadcast';
import { defaultTodoTrigger, type TodoTriggerRecord } from '../shared/todo-triggers';
import {
  EXCEL_PREVIEW_EXTENSIONS,
  PDF_PREVIEW_EXTENSIONS,
  previewExcelBuffer,
  previewPdfBuffer,
  WORKSPACE_OFFICE_PREVIEW_MAX_BYTES,
} from '../workspace-office-preview';
import { readSubAgentSlots, writeSubAgentSlots } from '../sub-agent-service';
import { broadcastSubAgentsUpdated } from '../sub-agent-broadcast';
import { runSubAgentOnce } from '../sub-agent-runner';
import { rebuildHermesSkillFtsIndex, searchHermesMemory } from './hermes-memory-db';
import { listWorkspaceHermesSkills, readWorkspaceSkillTextFile } from '../workspace-skills-read';
import { atomicWriteUtf8File } from './atomic-write';
import { assertValidSkillFolderName, guardHermesSkillTextContent } from './skills-guard';
import {
  refreshHermesSkillMemoryIndexBestEffort,
  isWorkspaceRelativeUnderHermesSkillTree,
  patchSummaryTouchesHermesSkillTree,
} from './hermes-skill-index-hooks';
import { isSkillIndexedDocumentRel, isSkillReferencesOnlyDocRel, normalizeSkillWorkspaceRel, normalizeWorkspaceRel } from './workspace-skill-paths';
import { WORKSPACE_AGENT_SKILLS_REL } from '../workspace-agent-layout';
import { SKILL_AGENT_SLOT_ID } from '../shared/skill-agent-constants';
import { ensureSubAgentRosterForWorkspace } from '../sub-agent-roster-bootstrap';

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
  /** 在主窗口内嵌浏览器（右侧 webview）中打开 URL；由 IPC 注入，无则仅能走系统浏览器 */
  openEmbeddedBrowser?: (url: string) => void;
  /** 与 `.agent/.tool/manifest.json` 对齐；未传则不在此层校验（引擎应始终传入） */
  workspaceToolSelection?: Record<WorkspaceToolId, boolean>;
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

  // additionalProperties=false；required 仅列出必填字段（与 JSON Schema / OpenClaw web_search 一致）
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

function truncateForToolLog(text: string, maxChars = 800): string {
  const s = String(text ?? '').trim();
  if (!s) return '';
  if (s.length <= maxChars) return s;
  return `${s.slice(0, maxChars)}\n... (truncated ${s.length - maxChars} chars) ...`;
}

function normalizePathForCompare(p: string): string {
  const s = String(p ?? '');
  return process.platform === 'win32' ? s.toLowerCase() : s;
}

async function assertNoExistingPathAliases(params: { rootPath: string; candidatePath: string }): Promise<void> {
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

async function assertResolvedPathStillInsideRoot(params: { rootPath: string; resolvedPath: string }): Promise<void> {
  const rootReal = await fs.promises.realpath(path.resolve(params.rootPath));
  const resolvedReal = await fs.promises.realpath(path.resolve(params.resolvedPath));
  const rootCmp = normalizePathForCompare(rootReal.endsWith(path.sep) ? rootReal : rootReal + path.sep);
  const targetCmp = normalizePathForCompare(resolvedReal);
  if (!targetCmp.startsWith(rootCmp)) throw new Error('Path escapes workspace (alias resolution)');
}

async function resolveRealPathInsideWorkspace(workspaceRoot: string, relativePath: string): Promise<string> {
  const full = workspaceExplorer.resolvePathInsideWorkspace(workspaceRoot, relativePath);
  const rootReal = await fs.promises.realpath(path.resolve(workspaceRoot));
  // realpath throws if missing; for new files we validate the parent dir instead
  const parentReal = await fs.promises.realpath(path.dirname(full));
  const rootCmp = normalizePathForCompare(rootReal.endsWith(path.sep) ? rootReal : rootReal + path.sep);
  const parentCmp = normalizePathForCompare(parentReal.endsWith(path.sep) ? parentReal : parentReal + path.sep);
  if (!parentCmp.startsWith(rootCmp)) throw new Error('Path escapes workspace');
  // additionally prevent symlink segments inside workspace root (OpenClaw-style)
  await assertNoExistingPathAliases({ rootPath: workspaceRoot, candidatePath: path.dirname(full) });
  return full;
}

function sha256(text: string): string {
  return createHash('sha256').update(String(text ?? ''), 'utf8').digest('hex').slice(0, 12);
}

function sanitizeRelForOp(rel: string): string {
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

async function writeOpRecord(workspaceRoot: string, meta: OpMeta, files?: Record<string, string | Buffer>): Promise<void> {
  const dir = path.join(workspaceRoot, '.clawflow', 'ops', meta.id);
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

async function readOpMeta(workspaceRoot: string, opId: string): Promise<OpMeta> {
  const p = path.join(workspaceRoot, '.clawflow', 'ops', opId, 'meta.json');
  const raw = await fs.promises.readFile(p, 'utf8');
  const parsed = JSON.parse(raw);
  return parsed as OpMeta;
}

function confirmRequiredMessage(op: string): string {
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
        break;
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
        const summary = truncateForToolLog(content, 320);
        ctx.onDelta?.(`[tool:done] ${name}${summary ? `\n${summary}\n` : '\n'}`);
        const isAsyncReceipt =
          String(name ?? '') === 'delegate_to_subagent' && /"state"\s*:\s*"running"/i.test(String(content ?? ''));
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

/** 注册的 \`function.name\` 须与 \`shared/workspace-tool-manifest-bridge.ts\` 中映射同步。 */
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
        name: 'delegate_to_subagent',
        description:
          'Delegate a task to a configured sub-agent slot. The sub-agent runs in the same workspace and inherits enabled tools from .agent/.tool/manifest.json. Reserved Skill Agent slot (`cf-skill-agent`) cannot be used here. Fixed delegate slots: `cf-sub-program`, `cf-sub-creative`, `cf-sub-data`, `cf-sub-assistant`.',
        strict: true,
        parameters: {
          type: 'object',
          properties: {
            slotId: { type: 'string', description: 'cf-sub-program | cf-sub-creative | cf-sub-data | cf-sub-assistant' },
            taskText: { type: 'string', description: 'Task to execute' },
            conversationId: { type: 'string', description: 'Target conversation id (current workspace singleton)' },
            modelId: { type: 'string', description: 'Optional model id' },
          },
          required: ['slotId', 'taskText', 'conversationId'],
          additionalProperties: false,
        },
      },
    },
    async (args, ctx) => {
      const slotId = String(args?.slotId ?? '').trim();
      const taskText = String(args?.taskText ?? '').trim();
      const conversationId = String(args?.conversationId ?? '').trim();
      const modelId = typeof args?.modelId === 'string' && args.modelId.trim() ? args.modelId.trim() : undefined;
      if (!slotId || !taskText || !conversationId) return 'ERROR: missing required fields';

      await ensureSubAgentRosterForWorkspace(ctx.workspaceRoot);
      const slots0 = await readSubAgentSlots(ctx.workspaceRoot);
      const slotMeta = slots0.find((s) => s.id === slotId);
      if (!slotMeta) return 'ERROR: slotId not found';
      if (slotMeta.delegatable === false) {
        return 'ERROR: this slot is reserved for the Skill Agent and cannot be delegated from the main agent';
      }

      // 一次性子 Agent：不阻塞当前会话；先返回运行回执，再异步写入最终结果 tool 消息
      const runId = randomUUID();
      const receipt = {
        ok: true,
        state: 'running',
        runId,
        slotId,
        note: 'Sub-agent started asynchronously; final receipt will be appended to this conversation.',
      };

      void (async () => {
        try {
          const res = await runSubAgentOnce({
            workspaceRoot: ctx.workspaceRoot,
            slotId,
            taskText,
            conversationId,
            modelId,
            oneOff: true,
            // AI 调度路径：不提供 onToolApprovalNeeded => 默认自动同意（由 engine 行为决定）
          });
          const msg = res.ok ? truncateForToolLog(res.message || '(empty)', 12_000) : `ERROR: sub-agent failed: ${res.error}`;
          // 追加一条 tool 消息（kind=tool.subagent.run），用于 UI loading → done
          await ctx.onToolEvent?.({
            phase: res.ok ? 'done' : 'fail',
            tool_call_id: String(ctx.currentToolCallId ?? ''),
            toolName: 'delegate_to_subagent',
            argumentsText: JSON.stringify({ slotId, taskText, conversationId, modelId }, null, 0),
            outputText: msg,
            ts: Date.now(),
            statusOverride: res.ok ? 'success' : 'error',
          });
        } catch {
          /* ignore */
        }
      })();

      return JSON.stringify(receipt, null, 2);
    }
  );

  rt.register(
    {
      type: 'function',
      function: {
        name: 'web_search',
        description:
          'Search the web. Returns provider-normalized results for current information lookup.',
        strict: true,
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search query string.' },
            count: {
              type: 'number',
              description: 'Number of results to return.',
              minimum: 1,
              maximum: WEB_SEARCH_MAX_COUNT,
            },
            country: { type: 'string', description: '2-letter country code for region-specific results.' },
            language: { type: 'string', description: 'ISO 639-1 language code for results.' },
            freshness: {
              type: 'string',
              description: 'Filter by time: day, week, month, or year.',
            },
            date_after: {
              type: 'string',
              description: 'Only results published after this date (YYYY-MM-DD).',
            },
            date_before: {
              type: 'string',
              description: 'Only results published before this date (YYYY-MM-DD).',
            },
            search_lang: { type: 'string', description: 'Brave search result language code.' },
            ui_lang: { type: 'string', description: 'Brave UI locale code in language-region format.' },
            domain_filter: {
              type: 'array',
              items: { type: 'string' },
              description: 'Perplexity native Search API domain filter.',
            },
            max_tokens: {
              type: 'number',
              description: 'Perplexity native Search API total content budget.',
              minimum: 1,
              maximum: 1000000,
            },
            max_tokens_per_page: {
              type: 'number',
              description: 'Perplexity native Search API max tokens extracted per page.',
              minimum: 1,
            },
          },
          required: ['query'],
          additionalProperties: false,
        },
      },
    },
    async (args, ctx) => {
      const out = await runClawFlowWebSearch(args as Record<string, unknown>, {
        abortSignal: ctx.abortSignal,
        config: ctx.config,
      });
      return JSON.stringify(out, null, 2);
    }
  );

  rt.register(
    {
      type: 'function',
      function: {
        name: 'open_embedded_browser',
        description:
          'Open a URL in ClawFlow built-in embedded browser (right sidebar webview). Use when the user asks to open a website in the app (e.g. Baidu: https://www.baidu.com). For keyword-based information lookup, prefer web_search.',
        strict: true,
        parameters: {
          type: 'object',
          properties: {
            url: {
              type: 'string',
              description: 'Full https URL or a domain like www.baidu.com',
            },
            prefer_system_browser: {
              type: 'boolean',
              description:
                'If true, open only in the OS default browser instead of the in-app webview.',
            },
          },
          required: ['url', 'prefer_system_browser'],
          additionalProperties: false,
        },
      },
    },
    async (args, ctx) => {
      const raw = String(args?.url ?? '');
      const preferSystem = Boolean(args?.prefer_system_browser);
      const normalized = normalizeHttpUrl(raw);
      if (!normalized || !isSafeHttpUrl(normalized)) {
        return JSON.stringify(
          { ok: false, error: 'invalid_or_unsafe_url', hint: 'Use http(s) only, e.g. https://www.baidu.com' },
          null,
          2
        );
      }
      if (preferSystem) {
        await shell.openExternal(normalized);
        return JSON.stringify({ ok: true, opened: 'system_browser', url: normalized }, null, 2);
      }
      if (ctx.openEmbeddedBrowser) {
        ctx.openEmbeddedBrowser(normalized);
        return JSON.stringify({ ok: true, opened: 'embedded_browser', url: normalized }, null, 2);
      }
      await shell.openExternal(normalized);
      return JSON.stringify(
        { ok: true, opened: 'system_browser_fallback', url: normalized, note: 'embedded panel unavailable' },
        null,
        2
      );
    }
  );

  rt.register(
    {
      type: 'function',
      function: {
        name: 'web_scrape',
        description:
          'HTTP(S) GET a public page, convert HTML to plain text, save full text under workspace .clawflow/scrapes, and return a JSON receipt with excerpt for the chat. Best for static/document pages; heavy client-side rendering may yield incomplete text.',
        strict: true,
        parameters: {
          type: 'object',
          properties: {
            url: { type: 'string', description: 'https URL or domain; http(s) only.' },
            max_chars: {
              type: 'number',
              description:
                'Optional cap on excerpt length in tool JSON (default ~24000; full plain text still saved under .clawflow/scrapes).',
              minimum: 2000,
              maximum: 100000,
            },
          },
          required: ['url'],
          additionalProperties: false,
        },
      },
    },
    async (args, ctx) => {
      const maxChars =
        typeof (args as { max_chars?: unknown })?.max_chars === 'number'
          ? (args as { max_chars: number }).max_chars
          : undefined;
      return await runWebScrapeForTool(
        { url: String((args as { url?: unknown })?.url ?? ''), max_chars: maxChars },
        { workspaceRoot: ctx.workspaceRoot, abortSignal: ctx.abortSignal }
      );
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
            maxEntries: { type: 'number', description: 'Max entries to return (default: 200)' },
          },
          required: ['relativePath', 'maxEntries'],
          additionalProperties: false,
        },
      },
    },
    async (args, ctx) => {
      const rel = String(args?.relativePath ?? '');
      const maxEntriesRaw = typeof args?.maxEntries === 'number' ? args.maxEntries : 200;
      const maxEntries = Number.isFinite(maxEntriesRaw) ? Math.max(1, Math.min(2000, Math.floor(maxEntriesRaw))) : 200;
      try {
        const entries = await workspaceExplorer.listWorkspaceDirectory(ctx.workspaceRoot, rel);
        return JSON.stringify(entries.slice(0, maxEntries), null, 2);
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
        description:
          'Read a file preview under workspace relative path. Images return a short marker; PDF returns JSON with text_extract; Excel returns tabular text like the UI preview.',
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
      if (res.isPdf) {
        return JSON.stringify(
          {
            ok: true,
            kind: 'pdf',
            pages_reported: res.numpages ?? 0,
            text_extract: res.textExtract ?? '',
            truncated: res.truncated,
            hint:
              (res.textExtract ?? '').trim().length === 0
                ? 'No text layer (may be scanned); use embedded preview or external OCR if needed.'
                : undefined,
          },
          null,
          2
        );
      }
      if (res.isBinary) return 'BINARY_FILE';
      return res.content;
    }
  );

  rt.register(
    {
      type: 'function',
      function: {
        name: 'workspace_read_file',
        description:
          'Read a text file under workspace with optional line range. For .pdf / Excel (.xlsx, .xls, .xlsm, .ods), extracts plain text (PDF: first pages, text layer only) then applies the line range.',
        strict: true,
        parameters: {
          type: 'object',
          properties: {
            relativePath: { type: 'string', description: 'Relative path under workspace root' },
            startLine: { type: 'number', description: '1-based start line (0 means from beginning)' },
            endLine: { type: 'number', description: '1-based end line (0 means to end)' },
            maxBytes: { type: 'number', description: 'Max bytes to read (default: 262144)' },
          },
          required: ['relativePath', 'startLine', 'endLine', 'maxBytes'],
          additionalProperties: false,
        },
      },
    },
    async (args, ctx) => {
      const rel = String(args?.relativePath ?? '');
      const startLineRaw = typeof args?.startLine === 'number' ? args.startLine : 0;
      const endLineRaw = typeof args?.endLine === 'number' ? args.endLine : 0;
      const maxBytesRaw = typeof args?.maxBytes === 'number' ? args.maxBytes : 262144;
      const startLine = Number.isFinite(startLineRaw) ? Math.max(0, Math.floor(startLineRaw)) : 0;
      const endLine = Number.isFinite(endLineRaw) ? Math.max(0, Math.floor(endLineRaw)) : 0;
      const maxBytes = Number.isFinite(maxBytesRaw) ? Math.max(1024, Math.min(1024 * 1024, Math.floor(maxBytesRaw))) : 262144;

      const full = await resolveRealPathInsideWorkspace(ctx.workspaceRoot, rel);
      const st = await fs.promises.stat(full);
      if (!st.isFile()) return 'ERROR: Not a file';
      const ext = path.extname(full).toLowerCase();

      if (EXCEL_PREVIEW_EXTENSIONS.has(ext) || PDF_PREVIEW_EXTENSIONS.has(ext)) {
        if (st.size > WORKSPACE_OFFICE_PREVIEW_MAX_BYTES) {
          return `ERROR: File too large for Excel/PDF text extraction (max ${WORKSPACE_OFFICE_PREVIEW_MAX_BYTES} bytes)`;
        }
        const buf = await fs.promises.readFile(full);
        let textBody: string;
        if (EXCEL_PREVIEW_EXTENSIONS.has(ext)) {
          textBody = previewExcelBuffer(buf).text;
        } else {
          const p = await previewPdfBuffer(buf);
          textBody = p.textExtract;
        }
        const lines = textBody.split(/\r?\n/);
        const sIdx = startLine > 0 ? Math.max(0, startLine - 1) : 0;
        const eIdx = endLine > 0 ? Math.min(lines.length, endLine) : lines.length;
        const picked = lines.slice(sIdx, eIdx);
        const header = `FILE:${rel}\nKIND:${EXCEL_PREVIEW_EXTENSIONS.has(ext) ? 'excel_text' : 'pdf_text'}\nLINES:${sIdx + 1}-${eIdx}\n`;
        return `${header}\n${picked.join('\n')}`;
      }

      const buf = await fs.promises.readFile(full);
      const slice = buf.length > maxBytes ? buf.subarray(0, maxBytes) : buf;
      const text = slice.toString('utf8');
      const lines = text.split(/\r?\n/);
      const sIdx = startLine > 0 ? Math.max(0, startLine - 1) : 0;
      const eIdx = endLine > 0 ? Math.min(lines.length, endLine) : lines.length;
      const picked = lines.slice(sIdx, eIdx);
      const header = `FILE:${rel}\nLINES:${sIdx + 1}-${eIdx}${buf.length > maxBytes ? ' (truncated)' : ''}\n`;
      return `${header}\n${picked.join('\n')}`;
    }
  );

  rt.register(
    {
      type: 'function',
      function: {
        name: 'workspace_write_file',
        description: 'Write a text file under workspace',
        strict: true,
        parameters: {
          type: 'object',
          properties: {
            relativePath: { type: 'string', description: 'Relative path under workspace root' },
            content: { type: 'string', description: 'New file content (utf-8)' },
            createIfMissing: { type: 'boolean', description: 'Create file if missing' },
            overwrite: { type: 'boolean', description: 'Overwrite file if exists' },
          },
          required: ['relativePath', 'content', 'createIfMissing', 'overwrite'],
          additionalProperties: false,
        },
      },
    },
    async (args, ctx) => {
      const rel = String(args?.relativePath ?? '');
      const content = String(args?.content ?? '');
      const createIfMissing = Boolean(args?.createIfMissing);
      const overwrite = Boolean(args?.overwrite);
      const full = await resolveRealPathInsideWorkspace(ctx.workspaceRoot, rel);
      const exists = await fs.promises
        .stat(full)
        .then((s) => s.isFile())
        .catch(() => false);
      if (exists && !overwrite) return 'ERROR: File exists (overwrite=false)';
      if (!exists && !createIfMissing) return 'ERROR: File does not exist (createIfMissing=false)';

      const before = exists ? await fs.promises.readFile(full, 'utf8').catch(() => '') : '';
      await fs.promises.mkdir(path.dirname(full), { recursive: true });
      await fs.promises.writeFile(full, content, 'utf8');
      const opId = randomUUID();
      await writeOpRecord(
        ctx.workspaceRoot,
        {
          version: 1,
          id: opId,
          ts: Date.now(),
          kind: 'write_file',
          relativePath: rel,
          details: { existed: exists, bytes: Buffer.byteLength(content, 'utf8') },
          rollback: { available: true },
        },
        { 'before.txt': before, 'after.txt': content }
      );
      if (isWorkspaceRelativeUnderHermesSkillTree(rel)) {
        refreshHermesSkillMemoryIndexBestEffort(ctx.workspaceRoot);
      }
      return JSON.stringify(
        {
          ok: true,
          workspaceRoot: ctx.workspaceRoot,
          path: rel,
          absolutePath: full,
          absolutePathDisplay: String(full).replace(/\\/g, '/'),
          existed: exists,
          opId,
          beforeHash: exists ? sha256(before) : null,
          afterHash: sha256(content),
          bytes: Buffer.byteLength(content, 'utf8'),
        },
        null,
        2
      );
    }
  );

  rt.register(
    {
      type: 'function',
      function: {
        name: 'workspace_apply_patch',
        description: 'Apply a safe text patch (replace oldText with newText) under workspace',
        strict: true,
        parameters: {
          type: 'object',
          properties: {
            relativePath: { type: 'string', description: 'Relative path under workspace root' },
            oldText: { type: 'string', description: 'Exact old text to replace (must match)' },
            newText: { type: 'string', description: 'New text to write in place' },
            replaceAll: { type: 'boolean', description: 'Replace all occurrences (default false)' },
          },
          required: ['relativePath', 'oldText', 'newText', 'replaceAll'],
          additionalProperties: false,
        },
      },
    },
    async (args, ctx) => {
      const rel = String(args?.relativePath ?? '');
      const oldText = String(args?.oldText ?? '');
      const newText = String(args?.newText ?? '');
      const replaceAll = Boolean(args?.replaceAll);
      if (!oldText) return 'ERROR: oldText is required';
      const full = await resolveRealPathInsideWorkspace(ctx.workspaceRoot, rel);
      const before = await fs.promises.readFile(full, 'utf8');
      const occurrences = before.split(oldText).length - 1;
      if (occurrences <= 0) return 'ERROR: oldText not found';
      if (!replaceAll && occurrences !== 1) return `ERROR: oldText matched ${occurrences} times (replaceAll=false)`;
      const after = replaceAll ? before.split(oldText).join(newText) : before.replace(oldText, newText);
      await fs.promises.writeFile(full, after, 'utf8');
      const opId = randomUUID();
      await writeOpRecord(
        ctx.workspaceRoot,
        {
          version: 1,
          id: opId,
          ts: Date.now(),
          kind: 'apply_patch',
          relativePath: rel,
          details: { occurrences, replaceAll },
          rollback: { available: true },
        },
        { 'before.txt': before, 'after.txt': after }
      );
      if (isWorkspaceRelativeUnderHermesSkillTree(rel)) {
        refreshHermesSkillMemoryIndexBestEffort(ctx.workspaceRoot);
      }
      return JSON.stringify(
        {
          ok: true,
          workspaceRoot: ctx.workspaceRoot,
          path: rel,
          absolutePath: full,
          absolutePathDisplay: String(full).replace(/\\/g, '/'),
          opId,
          occurrences,
          beforeHash: sha256(before),
          afterHash: sha256(after),
          bytesBefore: Buffer.byteLength(before, 'utf8'),
          bytesAfter: Buffer.byteLength(after, 'utf8'),
        },
        null,
        2
      );
    }
  );

  rt.register(
    {
      type: 'function',
      function: {
        name: 'workspace_apply_patch_v2',
        description:
          'Apply an OpenClaw-compatible multi-file patch (*** Begin Patch/End Patch with Add/Update/Delete/Move). Workspace-only with strict safety guards.',
        strict: true,
        parameters: {
          type: 'object',
          properties: {
            input: { type: 'string', description: 'Patch content using *** Begin Patch / *** End Patch format.' },
            confirm: {
              type: 'boolean',
              description:
                'Must be true if patch includes destructive operations (Delete File / Move). Safe patches may pass false.',
            },
          },
          required: ['input', 'confirm'],
          additionalProperties: false,
        },
      },
    },
    async (args, ctx) => {
      const input = String(args?.input ?? '');
      const confirm = Boolean(args?.confirm);
      const parsed = parsePatchText(input);
      if (!parsed.hunks.length) return 'ERROR: No files were modified.';

      const hasDestructive = parsed.hunks.some((h) => h.kind === 'delete' || (h.kind === 'update' && Boolean(h.movePath)));
      if (hasDestructive && !confirm) {
        return confirmRequiredMessage('workspace_apply_patch_v2(destructive)');
      }

      const summary: ApplyPatchSummary = { added: [], modified: [], deleted: [] };
      const seen = { added: new Set<string>(), modified: new Set<string>(), deleted: new Set<string>() };
      const record = (bucket: keyof ApplyPatchSummary, value: string) => {
        if (seen[bucket].has(value)) return;
        seen[bucket].add(value);
        summary[bucket].push(value);
      };

      const opId = randomUUID();
      const opDir = path.join(ctx.workspaceRoot, '.clawflow', 'ops', opId);
      await fs.promises.mkdir(opDir, { recursive: true });

      const fileArtifacts: Record<string, string | Buffer> = {
        'patch.txt': parsed.patch,
      };

      for (const hunk of parsed.hunks) {
        if (ctx.abortSignal?.aborted) throw new Error('CANCELLED');

        if (hunk.kind === 'add') {
          const rel = String(hunk.path);
          const full = await resolveRealPathInsideWorkspace(ctx.workspaceRoot, rel);
          await fs.promises.mkdir(path.dirname(full), { recursive: true });
          await fs.promises.writeFile(full, hunk.contents, 'utf8');
          record('added', rel);
          fileArtifacts[path.join('files', sanitizeRelForOp(rel), 'after.txt')] = hunk.contents;
          continue;
        }

        if (hunk.kind === 'delete') {
          const rel = String(hunk.path);
          const full = await resolveRealPathInsideWorkspace(ctx.workspaceRoot, rel);
          const st = await fs.promises.stat(full).catch(() => null);
          if (!st?.isFile()) throw new Error(`Not a file: ${rel}`);
          // ensure final real path does not escape workspace (symlink/hardlink)
          await assertResolvedPathStillInsideRoot({ rootPath: ctx.workspaceRoot, resolvedPath: full });
          const trashRel = path.join('.clawflow', 'ops', opId, 'trash', rel);
          const trashFull = workspaceExplorer.resolvePathInsideWorkspace(ctx.workspaceRoot, trashRel);
          await fs.promises.mkdir(path.dirname(trashFull), { recursive: true });
          await fs.promises.rename(full, trashFull);
          record('deleted', rel);
          continue;
        }

        // update
        const rel = String(hunk.path);
        const full = await resolveRealPathInsideWorkspace(ctx.workspaceRoot, rel);
        const before = await fs.promises.readFile(full, 'utf8');
        const after = await applyUpdateHunk(full, hunk.chunks, { readFile: (p) => fs.promises.readFile(p, 'utf8') as any });

        if (hunk.movePath) {
          const moveRel = String(hunk.movePath);
          const moveFull = await resolveRealPathInsideWorkspace(ctx.workspaceRoot, moveRel);
          await fs.promises.mkdir(path.dirname(moveFull), { recursive: true });
          await fs.promises.writeFile(moveFull, after, 'utf8');
          // delete original by moving to trash for rollback
          const trashRel = path.join('.clawflow', 'ops', opId, 'trash', rel);
          const trashFull = workspaceExplorer.resolvePathInsideWorkspace(ctx.workspaceRoot, trashRel);
          await fs.promises.mkdir(path.dirname(trashFull), { recursive: true });
          await fs.promises.rename(full, trashFull);
          record('modified', moveRel);
          fileArtifacts[path.join('files', sanitizeRelForOp(moveRel), 'before.txt')] = before;
          fileArtifacts[path.join('files', sanitizeRelForOp(moveRel), 'after.txt')] = after;
        } else {
          await fs.promises.writeFile(full, after, 'utf8');
          record('modified', rel);
          fileArtifacts[path.join('files', sanitizeRelForOp(rel), 'before.txt')] = before;
          fileArtifacts[path.join('files', sanitizeRelForOp(rel), 'after.txt')] = after;
        }
      }

      await writeOpRecord(
        ctx.workspaceRoot,
        {
          version: 1,
          id: opId,
          ts: Date.now(),
          kind: 'apply_patch',
          relativePath: '(multi-file)',
          details: { summary },
          rollback: { available: true, hint: 'Use workspace_rollback_op(opId) to restore modified files or undelete.' },
        },
        fileArtifacts
      );

      if (patchSummaryTouchesHermesSkillTree(summary)) {
        refreshHermesSkillMemoryIndexBestEffort(ctx.workspaceRoot);
      }

      return JSON.stringify(
        {
          ok: true,
          workspaceRoot: ctx.workspaceRoot,
          opId,
          summary,
          text: formatSummary(summary),
        },
        null,
        2
      );
    }
  );

  rt.register(
    {
      type: 'function',
      function: {
        name: 'workspace_mkdir',
        description: 'Create a directory under workspace (recursive)',
        strict: true,
        parameters: {
          type: 'object',
          properties: {
            relativePath: { type: 'string', description: 'Directory path relative to workspace root' },
          },
          required: ['relativePath'],
          additionalProperties: false,
        },
      },
    },
    async (args, ctx) => {
      const rel = String(args?.relativePath ?? '');
      const full = await resolveRealPathInsideWorkspace(ctx.workspaceRoot, rel);
      await fs.promises.mkdir(full, { recursive: true });
      const opId = randomUUID();
      await writeOpRecord(ctx.workspaceRoot, {
        version: 1,
        id: opId,
        ts: Date.now(),
        kind: 'mkdir',
        relativePath: rel,
        rollback: { available: false, hint: 'Directory creation rollback is not implemented.' },
      });
      return JSON.stringify(
        { ok: true, workspaceRoot: ctx.workspaceRoot, path: rel, absolutePath: full, absolutePathDisplay: String(full).replace(/\\/g, '/'), opId },
        null,
        2
      );
    }
  );

  rt.register(
    {
      type: 'function',
      function: {
        name: 'workspace_rename_path',
        description: 'Rename/move a file under workspace',
        strict: true,
        parameters: {
          type: 'object',
          properties: {
            fromRelativePath: { type: 'string', description: 'Source path relative to workspace root' },
            toRelativePath: { type: 'string', description: 'Destination path relative to workspace root' },
            overwrite: { type: 'boolean', description: 'Overwrite destination if exists' },
          },
          required: ['fromRelativePath', 'toRelativePath', 'overwrite'],
          additionalProperties: false,
        },
      },
    },
    async (args, ctx) => {
      const fromRel = String(args?.fromRelativePath ?? '');
      const toRel = String(args?.toRelativePath ?? '');
      const overwrite = Boolean(args?.overwrite);
      const fromFull = await resolveRealPathInsideWorkspace(ctx.workspaceRoot, fromRel);
      const toFull = await resolveRealPathInsideWorkspace(ctx.workspaceRoot, toRel);
      const toExists = await fs.promises
        .stat(toFull)
        .then(() => true)
        .catch(() => false);
      if (toExists && !overwrite) return 'ERROR: Destination exists (overwrite=false)';
      await fs.promises.mkdir(path.dirname(toFull), { recursive: true });
      if (toExists && overwrite) {
        await fs.promises.rm(toFull, { force: true, recursive: true });
      }
      await fs.promises.rename(fromFull, toFull);
      const opId = randomUUID();
      await writeOpRecord(ctx.workspaceRoot, {
        version: 1,
        id: opId,
        ts: Date.now(),
        kind: 'rename_path',
        relativePath: fromRel,
        details: { toRelativePath: toRel, overwrite },
        rollback: { available: false, hint: 'Rename rollback is not implemented yet.' },
      });
      if (isWorkspaceRelativeUnderHermesSkillTree(fromRel) || isWorkspaceRelativeUnderHermesSkillTree(toRel)) {
        refreshHermesSkillMemoryIndexBestEffort(ctx.workspaceRoot);
      }
      return JSON.stringify(
        {
          ok: true,
          workspaceRoot: ctx.workspaceRoot,
          from: fromRel,
          to: toRel,
          fromAbsolutePath: fromFull,
          fromAbsolutePathDisplay: String(fromFull).replace(/\\/g, '/'),
          toAbsolutePath: toFull,
          toAbsolutePathDisplay: String(toFull).replace(/\\/g, '/'),
          opId,
        },
        null,
        2
      );
    }
  );

  rt.register(
    {
      type: 'function',
      function: {
        name: 'workspace_delete_path',
        description: 'Delete a file under workspace (moves to .clawflow/ops trash for rollback)',
        strict: true,
        parameters: {
          type: 'object',
          properties: {
            relativePath: { type: 'string', description: 'Target file path relative to workspace root' },
            confirm: { type: 'boolean', description: 'Must be true to proceed (dangerous operation)' },
          },
          required: ['relativePath', 'confirm'],
          additionalProperties: false,
        },
      },
    },
    async (args, ctx) => {
      const rel = String(args?.relativePath ?? '');
      const confirm = Boolean(args?.confirm);
      if (!confirm) return confirmRequiredMessage(`workspace_delete_path(${rel})`);
      const full = await resolveRealPathInsideWorkspace(ctx.workspaceRoot, rel);
      const st = await fs.promises.stat(full).catch(() => null);
      if (!st?.isFile()) return 'ERROR: Not a file';
      const opId = randomUUID();
      const trashRel = path.join('.clawflow', 'ops', opId, 'trash', rel);
      const trashFull = workspaceExplorer.resolvePathInsideWorkspace(ctx.workspaceRoot, trashRel);
      await fs.promises.mkdir(path.dirname(trashFull), { recursive: true });
      await fs.promises.rename(full, trashFull);
      await writeOpRecord(ctx.workspaceRoot, {
        version: 1,
        id: opId,
        ts: Date.now(),
        kind: 'delete_path',
        relativePath: rel,
        details: { trashRelativePath: trashRel, bytes: st.size },
        rollback: { available: true },
      });
      if (isWorkspaceRelativeUnderHermesSkillTree(rel)) {
        refreshHermesSkillMemoryIndexBestEffort(ctx.workspaceRoot);
      }
      return JSON.stringify(
        {
          ok: true,
          workspaceRoot: ctx.workspaceRoot,
          path: rel,
          absolutePath: full,
          absolutePathDisplay: String(full).replace(/\\/g, '/'),
          opId,
          movedTo: trashRel,
        },
        null,
        2
      );
    }
  );

  rt.register(
    {
      type: 'function',
      function: {
        name: 'workspace_rollback_op',
        description: 'Rollback a previous file operation by opId (best-effort)',
        strict: true,
        parameters: {
          type: 'object',
          properties: {
            opId: { type: 'string', description: 'Operation id returned by write/patch/delete tools' },
          },
          required: ['opId'],
          additionalProperties: false,
        },
      },
    },
    async (args, ctx) => {
      const opId = String(args?.opId ?? '').trim();
      if (!opId) return 'ERROR: opId is required';
      const meta = await readOpMeta(ctx.workspaceRoot, opId);
      if (!meta?.rollback?.available) return `ERROR: rollback not available for op ${opId}`;
      if (meta.kind === 'write_file' || meta.kind === 'apply_patch') {
        const beforePath = path.join(ctx.workspaceRoot, '.clawflow', 'ops', opId, 'before.txt');
        const before = await fs.promises.readFile(beforePath, 'utf8');
        const full = await resolveRealPathInsideWorkspace(ctx.workspaceRoot, meta.relativePath);
        await fs.promises.mkdir(path.dirname(full), { recursive: true });
        await fs.promises.writeFile(full, before, 'utf8');
        return JSON.stringify({ ok: true, opId, rolledBack: meta.kind, path: meta.relativePath }, null, 2);
      }
      if (meta.kind === 'delete_path') {
        const trashRel = String((meta.details as any)?.trashRelativePath ?? '');
        if (!trashRel) return 'ERROR: missing trashRelativePath';
        const trashFull = workspaceExplorer.resolvePathInsideWorkspace(ctx.workspaceRoot, trashRel);
        const targetFull = await resolveRealPathInsideWorkspace(ctx.workspaceRoot, meta.relativePath);
        await fs.promises.mkdir(path.dirname(targetFull), { recursive: true });
        await fs.promises.rename(trashFull, targetFull);
        return JSON.stringify({ ok: true, opId, rolledBack: meta.kind, path: meta.relativePath }, null, 2);
      }
      return `ERROR: rollback for kind ${meta.kind} not implemented`;
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

  // --- 工作区待办（持久化 + 调度 + 广播）---
  rt.register(
    {
      type: 'function',
      function: {
        name: 'workspace_todo_list',
        description: 'List scheduled todo triggers for this workspace (persistent under .clawflow)',
        strict: true,
        parameters: {
          type: 'object',
          properties: {},
          required: [],
          additionalProperties: false,
        },
      },
    },
    async (_args, ctx) => {
      const list = await readTodoTriggers(ctx.workspaceRoot);
      const summary = list.map((t) => ({
        id: t.id,
        title: t.title,
        enabled: t.enabled,
        status: t.status,
        nextFireAt: t.trigger.kind === 'schedule' ? t.trigger.nextFireAt : undefined,
        repeat: t.trigger.kind === 'schedule' ? t.trigger.repeat : undefined,
        submitToModel: t.action.submitToModel,
      }));
      return truncateForToolLog(JSON.stringify(summary, null, 2), 12_000);
    }
  );

  rt.register(
    {
      type: 'function',
      function: {
        name: 'workspace_todo_create',
        description:
          'Create a scheduled todo in this workspace. repeat=once|interval; for interval, set intervalMinutes>0.',
        strict: true,
        parameters: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'Short title' },
            actionText: { type: 'string', description: 'Body text injected when the todo fires' },
            submitToModel: { type: 'boolean', description: 'Whether firing should submit to the model' },
            repeat: { type: 'string', description: 'once or interval', enum: ['once', 'interval'] },
            intervalMinutes: { type: 'number', description: 'For repeat=interval, minutes between fires (ignored for once)' },
          },
          required: ['title', 'actionText', 'submitToModel', 'repeat', 'intervalMinutes'],
          additionalProperties: false,
        },
      },
    },
    async (args, ctx) => {
      const title = String(args?.title ?? '').trim();
      const actionText = String(args?.actionText ?? '');
      const submitToModel = Boolean(args?.submitToModel);
      const repeat = args?.repeat === 'interval' ? 'interval' : 'once';
      const intervalMinutes =
        typeof args?.intervalMinutes === 'number' && Number.isFinite(args.intervalMinutes) && args.intervalMinutes > 0
          ? Math.max(1, Math.floor(args.intervalMinutes))
          : undefined;

      let t = defaultTodoTrigger({ title: title || undefined });
      t = {
        ...t,
        title: title || t.title,
        action: { text: actionText, submitToModel },
        updatedAt: Date.now(),
      };
      if (repeat === 'interval' && intervalMinutes) {
        t = {
          ...t,
          trigger: {
            kind: 'schedule',
            repeat: 'interval',
            intervalMinutes,
            nextFireAt: Date.now() + intervalMinutes * 60_000,
          },
          consumeOnFire: false,
        };
      }
      t = ensureScheduleNextFire(t);
      const list = [...(await readTodoTriggers(ctx.workspaceRoot)), t];
      await writeTodoTriggers(ctx.workspaceRoot, list);
      rescheduleTodoTriggersForWorkspace(ctx.workspaceRoot);
      broadcastTodoTriggersUpdated(ctx.workspaceRoot);
      return `OK created todo id=${t.id}`;
    }
  );

  rt.register(
    {
      type: 'function',
      function: {
        name: 'workspace_todo_update',
        description: 'Update an existing todo by id (title, enabled, status, action, schedule fields)',
        strict: true,
        parameters: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Todo id' },
            title: { type: 'string', description: 'New title (optional)' },
            enabled: { type: 'boolean', description: 'Enable/disable' },
            status: { type: 'string', enum: ['pending', 'done'], description: 'Mark pending or done' },
            actionText: { type: 'string', description: 'Replace action body text' },
            submitToModel: { type: 'boolean', description: 'Replace submit-to-model flag' },
            repeat: { type: 'string', enum: ['once', 'interval'], description: 'Schedule repeat mode' },
            intervalMinutes: { type: 'number', description: 'Interval minutes when repeat=interval' },
          },
          required: ['id'],
          additionalProperties: false,
        },
      },
    },
    async (args, ctx) => {
      const id = String(args?.id ?? '').trim();
      if (!id) return 'ERROR: missing id';
      const list = await readTodoTriggers(ctx.workspaceRoot);
      const idx = list.findIndex((x) => x.id === id);
      if (idx < 0) return `ERROR: not found: ${id}`;
      let t: TodoTriggerRecord = { ...list[idx] };
      const now = Date.now();
      if (typeof args.title === 'string' && args.title.trim()) t = { ...t, title: args.title.trim(), updatedAt: now };
      if (typeof args.enabled === 'boolean') t = { ...t, enabled: args.enabled, updatedAt: now };
      if (args.status === 'pending' || args.status === 'done') t = { ...t, status: args.status, updatedAt: now };
      if (typeof args.actionText === 'string')
        t = { ...t, action: { ...t.action, text: args.actionText }, updatedAt: now };
      if (typeof args.submitToModel === 'boolean')
        t = { ...t, action: { ...t.action, submitToModel: args.submitToModel }, updatedAt: now };
      if ((args.repeat === 'once' || args.repeat === 'interval') && t.trigger.kind === 'schedule') {
        const tr = t.trigger;
        t = {
          ...t,
          trigger: { ...tr, repeat: args.repeat },
          updatedAt: now,
        };
      }
      if (typeof args.intervalMinutes === 'number' && args.intervalMinutes > 0 && t.trigger.kind === 'schedule') {
        const tr = t.trigger;
        t = {
          ...t,
          trigger: {
            ...tr,
            intervalMinutes: Math.max(1, Math.floor(args.intervalMinutes)),
            repeat: tr.repeat === 'once' ? 'interval' : tr.repeat,
            nextFireAt: Date.now() + Math.max(1, Math.floor(args.intervalMinutes)) * 60_000,
          },
          updatedAt: now,
        };
      }
      t = ensureScheduleNextFire(t);
      const next = [...list];
      next[idx] = t;
      await writeTodoTriggers(ctx.workspaceRoot, next);
      rescheduleTodoTriggersForWorkspace(ctx.workspaceRoot);
      broadcastTodoTriggersUpdated(ctx.workspaceRoot);
      return `OK updated todo ${id}`;
    }
  );

  rt.register(
    {
      type: 'function',
      function: {
        name: 'workspace_todo_remove',
        description: 'Remove a todo trigger by id from this workspace',
        strict: true,
        parameters: {
          type: 'object',
          properties: { id: { type: 'string', description: 'Todo id' } },
          required: ['id'],
          additionalProperties: false,
        },
      },
    },
    async (args, ctx) => {
      const id = String(args?.id ?? '').trim();
      if (!id) return 'ERROR: missing id';
      const list = await readTodoTriggers(ctx.workspaceRoot);
      const next = list.filter((x) => x.id !== id);
      if (next.length === list.length) return `ERROR: not found: ${id}`;
      await writeTodoTriggers(ctx.workspaceRoot, next);
      rescheduleTodoTriggersForWorkspace(ctx.workspaceRoot);
      broadcastTodoTriggersUpdated(ctx.workspaceRoot);
      return `OK removed todo ${id}`;
    }
  );

  // --- 子 Agent 槽位（最小元数据）---
  rt.register(
    {
      type: 'function',
      function: {
        name: 'workspace_subagent_list',
        description: 'List sub-agent slots (metadata) persisted for this workspace',
        strict: true,
        parameters: {
          type: 'object',
          properties: {},
          required: [],
          additionalProperties: false,
        },
      },
    },
    async (_args, ctx) => {
      await ensureSubAgentRosterForWorkspace(ctx.workspaceRoot);
      const slots = await readSubAgentSlots(ctx.workspaceRoot);
      return truncateForToolLog(JSON.stringify(slots, null, 2), 12_000);
    }
  );

  rt.register(
    {
      type: 'function',
      function: {
        name: 'workspace_subagent_upsert',
        description:
          'Update label/behavior for a fixed sub-agent slot only. Roster ids: cf-sub-program, cf-sub-creative, cf-sub-data, cf-sub-assistant; cf-skill-agent when workspace tools.skills is enabled. Empty id is not allowed; new slots cannot be created.',
        strict: true,
        parameters: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Fixed roster slot id (required)' },
            label: { type: 'string', description: 'Short label' },
            behavior: { type: 'string', description: 'Role / behavior summary' },
          },
          required: ['id', 'label', 'behavior'],
          additionalProperties: false,
        },
      },
    },
    async (args, ctx) => {
      await ensureSubAgentRosterForWorkspace(ctx.workspaceRoot);
      const rawId = String(args?.id ?? '').trim();
      const label = String(args?.label ?? '').trim();
      const behavior = String(args?.behavior ?? '');
      if (!rawId) {
        return 'ERROR: slot id is required; fixed roster: cf-sub-program, cf-sub-creative, cf-sub-data, cf-sub-assistant (and cf-skill-agent when tools.skills is enabled)';
      }
      if (!label) return 'ERROR: missing label';
      const slots = await readSubAgentSlots(ctx.workspaceRoot);
      const idx = slots.findIndex((s) => s.id === rawId);
      if (idx < 0) {
        return `ERROR: unknown slot id "${rawId}". Only the fixed roster exists; arbitrary create is disabled.`;
      }
      const next = [...slots];
      if (next[idx].id === SKILL_AGENT_SLOT_ID) {
        next[idx] = {
          ...next[idx],
          label,
          behavior,
          roleTemplateId: 'skills',
          delegatable: false,
        };
      } else {
        next[idx] = { ...next[idx], label, behavior };
      }
      await writeSubAgentSlots(ctx.workspaceRoot, next);
      broadcastSubAgentsUpdated(ctx.workspaceRoot);
      return `OK upsert subAgent id=${rawId}`;
    }
  );

  rt.register(
    {
      type: 'function',
      function: {
        name: 'workspace_subagent_remove',
        description: 'Removing sub-agent slots is disabled; roster is fixed per workspace.',
        strict: true,
        parameters: {
          type: 'object',
          properties: { id: { type: 'string', description: 'Slot id' } },
          required: ['id'],
          additionalProperties: false,
        },
      },
    },
    async (args, _ctx) => {
      const id = String(args?.id ?? '').trim();
      if (!id) return 'ERROR: missing id';
      return 'ERROR: sub-agent slot removal is disabled; roster is fixed (cf-sub-program, cf-sub-creative, cf-sub-data, cf-sub-assistant; cf-skill-agent when tools.skills is enabled)';
    }
  );

  rt.register(
    {
      type: 'function',
      function: {
        name: 'workspace_knowledge_query',
        description:
          'Search indexed workspace skills and references via local SQLite FTS5 (Hermes memory). Returns short snippets with paths.',
        strict: true,
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Keywords or question (AND tokenization)' },
          },
          required: ['query'],
          additionalProperties: false,
        },
      },
    },
    async (args, ctx) => {
      const q = String(args?.query ?? '').trim();
      if (!q) return 'ERROR: missing query';
      const res = searchHermesMemory(ctx.workspaceRoot, { query: q, limit: 8 });
      if (!res.ok) return `ERROR: ${res.error}`;
      if (!res.hits.length) {
        return 'No matches in workspace memory/skills FTS index. Add `.agent/.skills/**/SKILL.md` or references, or enable knowledge_base and rebuild if needed.';
      }
      return res.hits
        .map(
          (h) =>
            `### ${h.source_path}${h.skill_name ? ` (skill: ${h.skill_name})` : ''}\n${h.snippet}\n`
        )
        .join('\n');
    }
  );

  rt.register(
    {
      type: 'function',
      function: {
        name: 'workspace_memory_search',
        description:
          'Full-text search over Hermes memory index (skills + references under .agent/.skills). Returns JSON hits with snippets and bm25 rank.',
        strict: true,
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Keywords; whitespace-separated tokens are AND-ed' },
            limit: { type: 'number', description: 'Max hits 1–50', minimum: 1, maximum: 50 },
            skill_name: { type: 'string', description: 'Optional filter: parent folder name of SKILL.md' },
          },
          required: ['query'],
          additionalProperties: false,
        },
      },
    },
    async (args, ctx) => {
      const q = String(args?.query ?? '').trim();
      if (!q) return 'ERROR: missing query';
      const lim = args?.limit;
      const skillName = args?.skill_name != null ? String(args.skill_name).trim() : undefined;
      const res = searchHermesMemory(ctx.workspaceRoot, {
        query: q,
        limit: typeof lim === 'number' ? lim : 12,
        skillName: skillName || undefined,
      });
      if (!res.ok) return JSON.stringify({ ok: false, error: res.error });
      return JSON.stringify({ ok: true, hits: res.hits }, null, 2);
    }
  );

  rt.register(
    {
      type: 'function',
      function: {
        name: 'workspace_skill_list',
        description:
          'List Hermes-style skills under `.agent/.skills/**` (directories containing SKILL.md). Read-only; returns JSON with skill roots and reference file paths.',
        strict: true,
        parameters: {
          type: 'object',
          properties: {},
          required: [],
          additionalProperties: false,
        },
      },
    },
    async (_args, ctx) => {
      const skills = listWorkspaceHermesSkills(ctx.workspaceRoot);
      return JSON.stringify({ ok: true, count: skills.length, skills }, null, 2);
    }
  );

  rt.register(
    {
      type: 'function',
      function: {
        name: 'workspace_skill_view',
        description:
          'Read a text file under `.agent/.skills` (SKILL.md or references/*.md|*.txt). Pass workspace-relative POSIX path.',
        strict: true,
        parameters: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'Relative path from workspace root, e.g. .agent/.skills/my-skill/SKILL.md' },
          },
          required: ['path'],
          additionalProperties: false,
        },
      },
    },
    async (args, ctx) => {
      const rel = String(args?.path ?? '').trim().replace(/\\/g, '/');
      if (!rel) return 'ERROR: missing path';
      const r = readWorkspaceSkillTextFile(ctx.workspaceRoot, rel);
      if (!r.ok) return `ERROR: ${r.error}`;
      return r.content;
    }
  );

  rt.register(
    {
      type: 'function',
      function: {
        name: 'workspace_skill_create',
        description:
          'Create a new Hermes skill folder with `.agent/.skills/<skill_name>/SKILL.md`. Fails if SKILL.md already exists.',
        strict: true,
        parameters: {
          type: 'object',
          properties: {
            skill_name: { type: 'string', description: 'Directory name under .agent/.skills (ASCII letters, digits, ._-)' },
            initial_markdown: { type: 'string', description: 'Optional SKILL.md body; default stub heading' },
          },
          required: ['skill_name'],
          additionalProperties: false,
        },
      },
    },
    async (args, ctx) => {
      const checked = assertValidSkillFolderName(String(args?.skill_name ?? ''));
      if (!checked.ok) return `ERROR: ${checked.reason}`;
      const initialRaw = args?.initial_markdown;
      const initial =
        typeof initialRaw === 'string' && initialRaw.trim()
          ? String(initialRaw)
          : `# ${checked.name}\n\nDescribe what this skill does.\n`;
      const gg = guardHermesSkillTextContent(initial);
      if (!gg.ok) return `ERROR: skills_guard: ${gg.reason}`;
      const rel = `${WORKSPACE_AGENT_SKILLS_REL}/${checked.name}/SKILL.md`;
      const full = await resolveRealPathInsideWorkspace(ctx.workspaceRoot, rel);
      const exists = await fs.promises
        .stat(full)
        .then((s) => s.isFile())
        .catch(() => false);
      if (exists) return `ERROR: skill already exists at ${rel}`;
      await atomicWriteUtf8File(full, initial);
      const opId = randomUUID();
      await writeOpRecord(
        ctx.workspaceRoot,
        {
          version: 1,
          id: opId,
          ts: Date.now(),
          kind: 'write_file',
          relativePath: rel,
          details: { skillCreate: true },
          rollback: { available: true },
        },
        { 'before.txt': '', 'after.txt': initial }
      );
      refreshHermesSkillMemoryIndexBestEffort(ctx.workspaceRoot);
      return JSON.stringify({ ok: true, path: rel, opId }, null, 2);
    }
  );

  rt.register(
    {
      type: 'function',
      function: {
        name: 'workspace_skill_patch',
        description:
          'Replace exact text in a skill document (SKILL.md or references/*.md|*.txt under .agent/.skills). Subject to skills_guard on the full file after substitution.',
        strict: true,
        parameters: {
          type: 'object',
          properties: {
            relativePath: { type: 'string', description: 'Workspace-relative path, must be under .agent/.skills' },
            oldText: { type: 'string', description: 'Exact old text' },
            newText: { type: 'string', description: 'Replacement text' },
            replaceAll: { type: 'boolean', description: 'Replace all occurrences' },
          },
          required: ['relativePath', 'oldText', 'newText', 'replaceAll'],
          additionalProperties: false,
        },
      },
    },
    async (args, ctx) => {
      const rel = normalizeSkillWorkspaceRel(String(args?.relativePath ?? ''));
      if (!isSkillIndexedDocumentRel(rel)) {
        return 'ERROR: relativePath must be SKILL.md or references/*.md|*.txt under .agent/.skills';
      }
      const oldText = String(args?.oldText ?? '');
      const newText = String(args?.newText ?? '');
      const replaceAll = Boolean(args?.replaceAll);
      if (!oldText) return 'ERROR: oldText is required';
      const full = await resolveRealPathInsideWorkspace(ctx.workspaceRoot, rel);
      let before: string;
      try {
        before = await fs.promises.readFile(full, 'utf8');
      } catch {
        return 'ERROR: file not found or not readable';
      }
      const occurrences = before.split(oldText).length - 1;
      if (occurrences <= 0) return 'ERROR: oldText not found';
      if (!replaceAll && occurrences !== 1) return `ERROR: oldText matched ${occurrences} times (replaceAll=false)`;
      const after = replaceAll ? before.split(oldText).join(newText) : before.replace(oldText, newText);
      const g = guardHermesSkillTextContent(after);
      if (!g.ok) return `ERROR: skills_guard: ${g.reason}`;
      await atomicWriteUtf8File(full, after);
      const opId = randomUUID();
      await writeOpRecord(
        ctx.workspaceRoot,
        {
          version: 1,
          id: opId,
          ts: Date.now(),
          kind: 'apply_patch',
          relativePath: rel,
          details: { occurrences, replaceAll, skillTool: true },
          rollback: { available: true },
        },
        { 'before.txt': before, 'after.txt': after }
      );
      refreshHermesSkillMemoryIndexBestEffort(ctx.workspaceRoot);
      return JSON.stringify(
        {
          ok: true,
          path: rel,
          opId,
          occurrences,
          beforeHash: sha256(before),
          afterHash: sha256(after),
        },
        null,
        2
      );
    }
  );

  rt.register(
    {
      type: 'function',
      function: {
        name: 'workspace_skill_write_aux',
        description:
          'Create or overwrite an auxiliary file under `.agent/.skills/<name>/references/` (.md or .txt only). Use workspace_skill_patch for SKILL.md.',
        strict: true,
        parameters: {
          type: 'object',
          properties: {
            relativePath: { type: 'string', description: 'e.g. .agent/.skills/my-skill/references/notes.md' },
            content: { type: 'string', description: 'Full file content (utf-8)' },
            createIfMissing: { type: 'boolean', description: 'Allow create when file missing' },
            overwrite: { type: 'boolean', description: 'Allow overwrite when file exists' },
          },
          required: ['relativePath', 'content', 'createIfMissing', 'overwrite'],
          additionalProperties: false,
        },
      },
    },
    async (args, ctx) => {
      const rel = normalizeSkillWorkspaceRel(String(args?.relativePath ?? ''));
      if (!isSkillReferencesOnlyDocRel(rel)) {
        return 'ERROR: only .agent/.skills/<name>/references/*.md|*.txt allowed';
      }
      const content = String(args?.content ?? '');
      const createIfMissing = Boolean(args?.createIfMissing);
      const overwrite = Boolean(args?.overwrite);
      const g = guardHermesSkillTextContent(content);
      if (!g.ok) return `ERROR: skills_guard: ${g.reason}`;
      const full = await resolveRealPathInsideWorkspace(ctx.workspaceRoot, rel);
      const exists = await fs.promises
        .stat(full)
        .then((s) => s.isFile())
        .catch(() => false);
      if (exists && !overwrite) return 'ERROR: File exists (overwrite=false)';
      if (!exists && !createIfMissing) return 'ERROR: File does not exist (createIfMissing=false)';
      const before = exists ? await fs.promises.readFile(full, 'utf8').catch(() => '') : '';
      await atomicWriteUtf8File(full, content);
      const opId = randomUUID();
      await writeOpRecord(
        ctx.workspaceRoot,
        {
          version: 1,
          id: opId,
          ts: Date.now(),
          kind: 'write_file',
          relativePath: rel,
          details: { skillAux: true, existed: exists },
          rollback: { available: true },
        },
        { 'before.txt': before, 'after.txt': content }
      );
      refreshHermesSkillMemoryIndexBestEffort(ctx.workspaceRoot);
      return JSON.stringify({ ok: true, path: rel, opId, existed: exists }, null, 2);
    }
  );

  rt.register(
    {
      type: 'function',
      function: {
        name: 'workspace_skill_delete',
        description:
          'Delete an entire skill directory `.agent/.skills/<skill_name>/` (recursive). Requires confirm=true.',
        strict: true,
        parameters: {
          type: 'object',
          properties: {
            skill_name: { type: 'string', description: 'Direct child folder name under .agent/.skills' },
            confirm: { type: 'boolean', description: 'Must be true' },
          },
          required: ['skill_name', 'confirm'],
          additionalProperties: false,
        },
      },
    },
    async (args, ctx) => {
      if (!Boolean(args?.confirm)) {
        return confirmRequiredMessage('workspace_skill_delete');
      }
      const checked = assertValidSkillFolderName(String(args?.skill_name ?? ''));
      if (!checked.ok) return `ERROR: ${checked.reason}`;
      const skillRootRel = `${WORKSPACE_AGENT_SKILLS_REL}/${checked.name}`;
      const full = await resolveRealPathInsideWorkspace(ctx.workspaceRoot, skillRootRel);
      const skillsBase = await resolveRealPathInsideWorkspace(ctx.workspaceRoot, WORKSPACE_AGENT_SKILLS_REL);
      const relFromBase = path.relative(skillsBase, full);
      const segs = relFromBase.split(/[/\\]/).filter(Boolean);
      if (segs.length !== 1 || segs[0] !== checked.name) {
        return 'ERROR: skill_name must be a direct child folder of .agent/.skills';
      }
      const st = await fs.promises.stat(full).catch(() => null);
      if (!st?.isDirectory()) return `ERROR: skill folder not found: ${skillRootRel}`;
      await fs.promises.rm(full, { recursive: true, force: true });
      refreshHermesSkillMemoryIndexBestEffort(ctx.workspaceRoot);
      return JSON.stringify({ ok: true, deleted: skillRootRel }, null, 2);
    }
  );

  rt.register(
    {
      type: 'function',
      function: {
        name: 'workspace_memory_rebuild_index',
        description:
          'Rebuild Hermes FTS index from `.agent/.skills/**` (SKILL.md + references/*.md|*.txt). Use after bulk edits or if search looks stale.',
        strict: true,
        parameters: {
          type: 'object',
          properties: {},
          required: [],
          additionalProperties: false,
        },
      },
    },
    async (_args, ctx) => {
      const res = await rebuildHermesSkillFtsIndex(ctx.workspaceRoot);
      if (!res.ok) return `ERROR: ${res.error}`;
      return `OK rebuilt skill/memory FTS index (rows upserted this pass: ${res.indexed}, pruned: ${res.pruned})`;
    }
  );

  return rt;
}

