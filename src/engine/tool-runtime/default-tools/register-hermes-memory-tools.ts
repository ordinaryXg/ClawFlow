import type { ToolRuntime } from '../tool-runtime-core';
import { notifyWorkspaceTreeChanged } from '../tool-runtime-core';
import { rebuildHermesSkillFtsIndex, searchHermesMemory, type HermesMemorySearchHit } from '../../hermes/hermes-memory-db';
import {
  deleteHermesMemoryDocument,
  listHermesMemoryDocuments,
  upsertHermesMemoryDocument,
} from '../../hermes/hermes-memory-store';
import { HERMES_MEMORY_REL_PREFIX } from '../../../main/workspace/workspace-hermes-layout';
import { refreshHermesMemoryIndexBestEffort } from '../../hermes/hermes-memory-index-hooks';

export function registerHermesMemoryTools(rt: ToolRuntime): void {
  const formatHermesHitsMarkdown = (hits: HermesMemorySearchHit[]) => {
    const kindLabel = (k: string) => {
      if (k === 'hermes_memory') return 'memory';
      if (k === 'knowledge_md' || k === 'knowledge_txt' || k === 'knowledge_ingest_md') return 'knowledge';
      if (k === 'conversation_summary') return 'chat';
      if (k.startsWith('skill')) return 'skill';
      return k;
    };
    return hits
      .map((h) => {
        const head =
          (h.source_kind === 'hermes_memory' || h.source_kind === 'knowledge_md') &&
          h.abstract
            ? `**L0:** ${h.abstract}\n`
            : '';
        const skill = h.skill_name ? ` (skill: ${h.skill_name})` : '';
        const title = h.title ? ` — ${h.title}` : '';
        const tag = kindLabel(h.source_kind);
        return `### [${tag}] ${h.source_path}${title}${skill}\n${head}${h.snippet}\n`;
      })
      .join('\n');
  };

  rt.register(
    {
      type: 'function',
      function: {
        name: 'hermes_search',
        description:
          'Search Hermes index (FTS5 + optional vectors): Hermes memory (`.agent/.hermes/memory/*` logical paths), `.agent/.knowledge`, `.agent/.skills`. Returns JSON hits.',
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
      const res = await searchHermesMemory(ctx.workspaceRoot, {
        query: q,
        limit: typeof lim === 'number' ? lim : 12,
        skillName: skillName || undefined,
      });
      if (!res.ok) return JSON.stringify({ ok: false, error: res.error });
      return JSON.stringify({ ok: true, hits: res.hits, hybridUsed: res.hybridUsed }, null, 2);
    }
  );

  rt.register(
    {
      type: 'function',
      function: {
        name: 'hermes_memory_upsert',
        description:
          'Create or update a Hermes memory entry in the index (no disk file). Use logical path under `.agent/.hermes/memory/` with `.md` suffix; optional L0/L1 via abstract/overview.',
        strict: true,
        parameters: {
          type: 'object',
          properties: {
            relative_path: { type: 'string', description: 'e.g. .agent/.hermes/memory/project/prefs.md' },
            title: { type: 'string' },
            abstract: { type: 'string', description: 'L0 one-line summary for FTS' },
            overview: { type: 'string', description: 'L1 short overview for FTS' },
            body: { type: 'string', description: 'L2 markdown body' },
          },
          required: ['relative_path', 'body'],
          additionalProperties: false,
        },
      },
    },
    async (args, ctx) => {
      const res = upsertHermesMemoryDocument(ctx.workspaceRoot, {
        relativePath: String(args?.relative_path ?? ''),
        title: args?.title != null ? String(args.title) : undefined,
        abstract: args?.abstract != null ? String(args.abstract) : undefined,
        overview: args?.overview != null ? String(args.overview) : undefined,
        body: String(args?.body ?? ''),
      });
      if (!res.ok) return `ERROR: ${res.error}`;
      refreshHermesMemoryIndexBestEffort(ctx.workspaceRoot);
      notifyWorkspaceTreeChanged(ctx.workspaceRoot);
      return JSON.stringify({ ok: true, source_path: res.source_path }, null, 2);
    }
  );

  rt.register(
    {
      type: 'function',
      function: {
        name: 'hermes_memory_delete',
        description: 'Delete a Hermes memory entry from the index by logical path under `.agent/.hermes/memory/`.',
        strict: true,
        parameters: {
          type: 'object',
          properties: {
            relative_path: { type: 'string' },
          },
          required: ['relative_path'],
          additionalProperties: false,
        },
      },
    },
    async (args, ctx) => {
      const res = deleteHermesMemoryDocument(ctx.workspaceRoot, String(args?.relative_path ?? ''));
      if (!res.ok) return `ERROR: ${res.error}`;
      refreshHermesMemoryIndexBestEffort(ctx.workspaceRoot);
      notifyWorkspaceTreeChanged(ctx.workspaceRoot);
      return JSON.stringify({ ok: true }, null, 2);
    }
  );

  rt.register(
    {
      type: 'function',
      function: {
        name: 'hermes_memory_list',
        description: 'List Hermes memory entries (logical paths + L0/L1 metadata) from the index.',
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
      try {
        const rows = listHermesMemoryDocuments(ctx.workspaceRoot);
        return JSON.stringify({ ok: true, count: rows.length, entries: rows }, null, 2);
      } catch (e: unknown) {
        return `ERROR: ${e instanceof Error ? e.message : String(e)}`;
      }
    }
  );

  rt.register(
    {
      type: 'function',
      function: {
        name: 'workspace_knowledge_query',
        description:
          '[Deprecated — prefer hermes_search] Search Hermes FTS index; memory, knowledge, and skills.',
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
      const res = await searchHermesMemory(ctx.workspaceRoot, { query: q, limit: 8 });
      if (!res.ok) return `ERROR: ${res.error}`;
      if (!res.hits.length) {
        return `No matches in Hermes index. Use hermes_memory_upsert (${HERMES_MEMORY_REL_PREFIX}/), add .agent/.knowledge/, or .agent/.skills/**/SKILL.md, or run workspace_memory_rebuild_index.`;
      }
      return formatHermesHitsMarkdown(res.hits);
    }
  );

  rt.register(
    {
      type: 'function',
      function: {
        name: 'workspace_memory_search',
        description:
          '[Deprecated — prefer hermes_search] JSON search over Hermes FTS (memory + skills + knowledge).',
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
      const res = await searchHermesMemory(ctx.workspaceRoot, {
        query: q,
        limit: typeof lim === 'number' ? lim : 12,
        skillName: skillName || undefined,
      });
      if (!res.ok) return JSON.stringify({ ok: false, error: res.error });
      return JSON.stringify({ ok: true, hits: res.hits, hybridUsed: res.hybridUsed }, null, 2);
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
      return `OK rebuilt Hermes FTS index (memory index + .agent/.skills + knowledge); rows upserted this pass: ${res.indexed}, pruned: ${res.pruned}`;
    }
  );
}
