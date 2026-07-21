import * as path from 'path';
import * as fs from 'fs';
import { randomUUID } from 'crypto';
import {
  ToolRuntime,
  notifyWorkspaceTreeChanged,
  resolveRealPathInsideWorkspace,
  confirmRequiredMessage,
  sha256,
  writeOpRecord,
} from '../tool-runtime-core';
import { readWorkspaceSkillTextFile } from '../../../main/workspace/workspace-skills-read';
import { syncWorkspaceSkillManifest } from '../../../main/workspace/workspace-skill-manifest';
import { atomicWriteUtf8File } from '../atomic-write';
import { assertValidSkillFolderName, guardHermesSkillTextContent } from '../skills-guard';
import { refreshHermesMemoryIndexBestEffort } from '../../hermes/hermes-memory-index-hooks';
import {
  isSkillIndexedDocumentRel,
  isSkillReferencesOnlyDocRel,
  normalizeSkillWorkspaceRel,
} from '../workspace-skill-paths';
import { WORKSPACE_AGENT_SKILLS_REL } from '../../../main/workspace/workspace-agent-layout';

export function registerWorkspaceSkillsTools(rt: ToolRuntime): void {
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
      refreshHermesMemoryIndexBestEffort(ctx.workspaceRoot);
      void syncWorkspaceSkillManifest(ctx.workspaceRoot).catch(() => undefined);
      notifyWorkspaceTreeChanged(ctx.workspaceRoot);
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
      refreshHermesMemoryIndexBestEffort(ctx.workspaceRoot);
      void syncWorkspaceSkillManifest(ctx.workspaceRoot).catch(() => undefined);
      notifyWorkspaceTreeChanged(ctx.workspaceRoot);
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
      refreshHermesMemoryIndexBestEffort(ctx.workspaceRoot);
      notifyWorkspaceTreeChanged(ctx.workspaceRoot);
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
      if (args?.confirm !== true) {
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
      refreshHermesMemoryIndexBestEffort(ctx.workspaceRoot);
      void syncWorkspaceSkillManifest(ctx.workspaceRoot).catch(() => undefined);
      notifyWorkspaceTreeChanged(ctx.workspaceRoot);
      return JSON.stringify({ ok: true, deleted: skillRootRel }, null, 2);
    }
  );
}
