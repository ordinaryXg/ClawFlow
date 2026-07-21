/**
 * 将工作区内 PDF/Office 抽取为 Markdown，写入 `.agent/.clawflow/knowledge-ingest/` 并进入 FTS。
 */

import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { clawflowDir } from './workspace-service';
import {
  EXCEL_PREVIEW_EXTENSIONS,
  PDF_PREVIEW_EXTENSIONS,
  WORKSPACE_OFFICE_PREVIEW_MAX_BYTES,
  previewExcelBuffer,
  previewPdfBuffer,
} from './workspace-office-preview';
import { normalizeUserWorkspaceRelativePath, resolvePathInsideWorkspace } from './workspace-explorer';
import { refreshHermesMemoryIndexBestEffort } from '../../engine/hermes/hermes-memory-index-hooks';

export function knowledgeIngestDirAbs(workspaceRoot: string): string {
  return path.join(clawflowDir(workspaceRoot), 'knowledge-ingest');
}

const INGEST_EXT = new Set([
  ...PDF_PREVIEW_EXTENSIONS,
  ...EXCEL_PREVIEW_EXTENSIONS,
  '.doc',
  '.docx',
  '.ppt',
  '.pptx',
]);

export async function ingestWorkspaceFileToKnowledge(
  workspaceRoot: string,
  relativePath: string
): Promise<{ ok: true; ingestRelPath: string; sourceRelPath: string } | { ok: false; error: string }> {
  const root = path.resolve(workspaceRoot);
  let rel: string;
  try {
    rel = normalizeUserWorkspaceRelativePath(root, relativePath);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg };
  }
  if (!rel) return { ok: false, error: 'missing path' };

  let abs: string;
  try {
    abs = resolvePathInsideWorkspace(root, rel);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg };
  }
  let st: fs.Stats;
  try {
    st = await fs.promises.stat(abs);
  } catch {
    return { ok: false, error: 'file not found' };
  }
  if (!st.isFile()) return { ok: false, error: 'not a file' };
  if (st.size > WORKSPACE_OFFICE_PREVIEW_MAX_BYTES) {
    return { ok: false, error: 'file too large' };
  }

  const ext = path.extname(abs).toLowerCase();
  if (!INGEST_EXT.has(ext)) {
    return { ok: false, error: 'unsupported extension for ingest' };
  }

  const buf = await fs.promises.readFile(abs);
  let extracted = '';
  let pages = 0;
  if (PDF_PREVIEW_EXTENSIONS.has(ext)) {
    const p = await previewPdfBuffer(buf);
    extracted = p.textExtract;
    pages = p.numpages;
  } else if (EXCEL_PREVIEW_EXTENSIONS.has(ext)) {
    const x = previewExcelBuffer(buf);
    extracted = x.text;
  } else {
    return { ok: false, error: 'unsupported extension for ingest' };
  }

  const trimmed = extracted.trim();
  if (!trimmed) {
    return { ok: false, error: 'no extractable text' };
  }

  const id = randomUUID().slice(0, 8);
  const baseName = path.basename(abs, ext).replace(/[^\w\u4e00-\u9fff-]+/gi, '-').slice(0, 48) || 'doc';
  const ingestRel = `.agent/.clawflow/knowledge-ingest/${baseName}-${id}.md`;
  const ingestAbs = path.join(root, ...ingestRel.split('/'));

  const title = path.basename(abs);
  const abstract =
    pages > 0
      ? `Extracted from ${rel} (${pages} pages)`
      : `Extracted from ${rel}`;

  const md = [
    '---',
    `title: ${JSON.stringify(title)}`,
    `abstract: ${JSON.stringify(abstract)}`,
    'overview: |',
    `  Source: \`${rel}\``,
    `  Ingested: ${new Date().toISOString()}`,
    '---',
    '',
    `# ${title}`,
    '',
    trimmed,
    '',
  ].join('\n');

  await fs.promises.mkdir(path.dirname(ingestAbs), { recursive: true });
  await fs.promises.writeFile(ingestAbs, md, 'utf8');

  try {
    refreshHermesMemoryIndexBestEffort(root);
  } catch {
    /* ignore */
  }

  return { ok: true, ingestRelPath: ingestRel, sourceRelPath: rel };
}
