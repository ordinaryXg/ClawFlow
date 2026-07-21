import * as path from 'path';
import * as fs from 'fs';
import { randomUUID } from 'crypto';
import * as workspaceExplorer from '../../../main/workspace/workspace-explorer';
import { applyUpdateHunk, formatSummary, parsePatchText, type ApplyPatchSummary } from '../apply-patch';
import {
  EXCEL_PREVIEW_EXTENSIONS,
  PDF_PREVIEW_EXTENSIONS,
  previewExcelBuffer,
  previewPdfBuffer,
  WORKSPACE_OFFICE_PREVIEW_MAX_BYTES,
} from '../../../main/workspace/workspace-office-preview';
import { clawflowDir, CLAWFLOW_DIR } from '../../../main/workspace/workspace-service';
import { HERMES_MEMORY_REL_PREFIX } from '../../../main/workspace/workspace-hermes-layout';
import {
  refreshHermesMemoryIndexBestEffort,
  isWorkspaceRelativeUnderHermesIndexedTextTree,
  patchSummaryTouchesHermesIndexedText,
} from '../../hermes/hermes-memory-index-hooks';
import {
  ToolRuntime,
  notifyWorkspaceTreeChanged,
  isBlockedHermesMemoryDiskWrite,
  assertResolvedPathStillInsideRoot,
  resolveRealPathInsideWorkspace,
  sha256,
  sanitizeRelForOp,
  writeOpRecord,
  readOpMeta,
  confirmRequiredMessage,
} from '../tool-runtime-core';

export function registerWorkspaceDocsTools(rt: ToolRuntime): void {
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
      if (isBlockedHermesMemoryDiskWrite(rel)) {
        return `ERROR: Hermes memory is index-only (use hermes_memory_upsert). Logical prefix: ${HERMES_MEMORY_REL_PREFIX}/`;
      }
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
      if (isWorkspaceRelativeUnderHermesIndexedTextTree(rel)) {
        refreshHermesMemoryIndexBestEffort(ctx.workspaceRoot);
      }
      notifyWorkspaceTreeChanged(ctx.workspaceRoot);
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
      if (isWorkspaceRelativeUnderHermesIndexedTextTree(rel)) {
        refreshHermesMemoryIndexBestEffort(ctx.workspaceRoot);
      }
      notifyWorkspaceTreeChanged(ctx.workspaceRoot);
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
          'Apply a multi-file unified diff patch (*** Begin Patch/End Patch with Add/Update/Delete/Move). Workspace-only with strict safety guards.',
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
      const opDir = path.join(clawflowDir(ctx.workspaceRoot), 'ops', opId);
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
          const trashRel = path.posix.join(CLAWFLOW_DIR, 'ops', opId, 'trash', rel);
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
          const trashRel = path.posix.join(CLAWFLOW_DIR, 'ops', opId, 'trash', rel);
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

      if (patchSummaryTouchesHermesIndexedText(summary)) {
        refreshHermesMemoryIndexBestEffort(ctx.workspaceRoot);
      }

      notifyWorkspaceTreeChanged(ctx.workspaceRoot);
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
      notifyWorkspaceTreeChanged(ctx.workspaceRoot);
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
      if (
        isWorkspaceRelativeUnderHermesIndexedTextTree(fromRel) ||
        isWorkspaceRelativeUnderHermesIndexedTextTree(toRel)
      ) {
        refreshHermesMemoryIndexBestEffort(ctx.workspaceRoot);
      }
      notifyWorkspaceTreeChanged(ctx.workspaceRoot);
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
        description: 'Delete a file under workspace (moves to .agent/.clawflow/ops trash for rollback)',
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
      const trashRel = path.posix.join(CLAWFLOW_DIR, 'ops', opId, 'trash', rel);
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
      if (isWorkspaceRelativeUnderHermesIndexedTextTree(rel)) {
        refreshHermesMemoryIndexBestEffort(ctx.workspaceRoot);
      }
      notifyWorkspaceTreeChanged(ctx.workspaceRoot);
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
        const beforePath = path.join(clawflowDir(ctx.workspaceRoot), 'ops', opId, 'before.txt');
        const before = await fs.promises.readFile(beforePath, 'utf8');
        const full = await resolveRealPathInsideWorkspace(ctx.workspaceRoot, meta.relativePath);
        await fs.promises.mkdir(path.dirname(full), { recursive: true });
        await fs.promises.writeFile(full, before, 'utf8');
        notifyWorkspaceTreeChanged(ctx.workspaceRoot);
        return JSON.stringify({ ok: true, opId, rolledBack: meta.kind, path: meta.relativePath }, null, 2);
      }
      if (meta.kind === 'delete_path') {
        const trashRel = String((meta.details as any)?.trashRelativePath ?? '');
        if (!trashRel) return 'ERROR: missing trashRelativePath';
        const trashFull = workspaceExplorer.resolvePathInsideWorkspace(ctx.workspaceRoot, trashRel);
        const targetFull = await resolveRealPathInsideWorkspace(ctx.workspaceRoot, meta.relativePath);
        await fs.promises.mkdir(path.dirname(targetFull), { recursive: true });
        await fs.promises.rename(trashFull, targetFull);
        notifyWorkspaceTreeChanged(ctx.workspaceRoot);
        return JSON.stringify({ ok: true, opId, rolledBack: meta.kind, path: meta.relativePath }, null, 2);
      }
      return `ERROR: rollback for kind ${meta.kind} not implemented`;
    }
  );
}
