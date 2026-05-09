import type { ToolSchema, ToolCall } from './providers/types';
import * as workspaceExplorer from '../workspace-explorer';
import type { ClawFlowEngineConfig } from './clawflow-engine';

export type ToolExecutionContext = {
  workspaceRoot: string;
  config?: ClawFlowEngineConfig;
};

export type ToolResult = { tool_call_id: string; content: string };

type ToolHandler = (args: any, ctx: ToolExecutionContext) => Promise<string> | string;

type RegisteredTool = {
  schema: ToolSchema;
  handler: ToolHandler;
};

export class ToolRuntime {
  private tools = new Map<string, RegisteredTool>();

  register(schema: ToolSchema, handler: ToolHandler): void {
    this.tools.set(schema.function.name, { schema, handler });
  }

  listSchemas(): ToolSchema[] {
    return Array.from(this.tools.values()).map((t) => t.schema);
  }

  async executeToolCalls(calls: ToolCall[], ctx: ToolExecutionContext): Promise<ToolResult[]> {
    const results: ToolResult[] = [];
    for (const call of calls) {
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
      try {
        const out = await entry.handler(args, ctx);
        results.push({ tool_call_id: call.id, content: typeof out === 'string' ? out : JSON.stringify(out) });
      } catch (e: any) {
        results.push({ tool_call_id: call.id, content: `Tool error: ${e?.message ?? String(e)}` });
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

  return rt;
}

