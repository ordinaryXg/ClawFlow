/**
 * 工作空间内安全列目录 / 读文件（主进程，供 IPC 使用）。
 */

import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { WORKSPACE_IMAGE_PREVIEW_MAX_BYTES } from '../../shared/workspace-preview-limits';
import {
  EXCEL_PREVIEW_EXTENSIONS,
  PDF_PREVIEW_EXTENSIONS,
  previewExcelBuffer,
  previewPdfBuffer,
  WORKSPACE_OFFICE_PREVIEW_MAX_BYTES,
} from './workspace-office-preview';
import { clawflowDir } from './workspace-service';
import { getBetterSqliteCtor } from '../../engine/hermes-memory-db';

const TEXT_PREVIEW_MAX = 256 * 1024;
const FILE_HARD_MAX = 1024 * 1024;

const IMAGE_EXT_TO_MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.avif': 'image/avif',
  '.tif': 'image/tiff',
  '.tiff': 'image/tiff',
};

const IMAGE_PREVIEW_TOO_LARGE = 'IMAGE_PREVIEW_TOO_LARGE';

const SQLITE_FILE_EXTENSIONS = new Set(['.db', '.sqlite', '.sqlite3', '.db3']);

function isSqliteMagicHeader(buf: Buffer): boolean {
  return buf.length >= 16 && buf.subarray(0, 16).toString('utf8') === 'SQLite format 3\u0000';
}

function quoteSqliteIdent(name: string): string {
  return `"${String(name).replace(/"/g, '""')}"`;
}

function previewSqliteDatabaseFile(full: string, sizeBytes: number): FilePreviewResult {
  const Ctor = getBetterSqliteCtor();
  const base = path.basename(full);
  if (!Ctor) {
    return {
      ok: true,
      content: `# SQLite: ${base}\n\nSize: ${sizeBytes} bytes\n\n（未加载 better-sqlite3，无法解析表结构。）`,
      truncated: false,
      isBinary: false,
    };
  }
  let db: InstanceType<typeof Ctor> | null = null;
  try {
    db = new Ctor(full, { readonly: true, fileMustExist: true });
    const tables = db
      .prepare(
        `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name COLLATE NOCASE`
      )
      .all() as { name: string }[];
    const lines = [`# SQLite: ${base}`, `Size: ${sizeBytes} bytes`, '', '## Tables', ''];
    const maxTables = 80;
    for (const row of tables.slice(0, maxTables)) {
      const name = row.name;
      let count = '?';
      try {
        const got = db.prepare(`SELECT COUNT(*) AS c FROM ${quoteSqliteIdent(name)}`).get() as { c: number };
        count = String(got?.c ?? '?');
      } catch {
        /* locked or virtual */
      }
      lines.push(`- **${name}** — ${count} rows`);
    }
    if (tables.length > maxTables) {
      lines.push('', `… and ${tables.length - maxTables} more tables`);
    }
    if (tables.length === 0) {
      lines.push('_(no user tables)_');
    }
    return {
      ok: true,
      content: lines.join('\n'),
      truncated: tables.length > maxTables,
      isBinary: false,
    };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      ok: true,
      content: `# SQLite: ${base}\n\nSize: ${sizeBytes} bytes\n\n无法打开预览：${msg}\n\n若文件正被其它进程占用，请关闭后重试。`,
      truncated: false,
      isBinary: false,
    };
  } finally {
    if (db) {
      try {
        db.close();
      } catch {
        /* ignore */
      }
    }
  }
}

function tryDecodeUtf16Le(buf: Buffer): string | null {
  if (buf.length % 2 !== 0 || buf.length === 0) return null;
  try {
    const dec = new TextDecoder('utf-16le', { fatal: true }).decode(buf);
    const roundTrip = Buffer.from(dec, 'utf16le');
    if (!roundTrip.equals(buf)) return null;
    return dec;
  } catch {
    return null;
  }
}

function tryDecodeUtf16Be(buf: Buffer): string | null {
  if (buf.length % 2 !== 0 || buf.length === 0) return null;
  const copy = Buffer.from(buf);
  copy.swap16();
  return tryDecodeUtf16Le(copy);
}

function isMostlyPrintableUtf8(s: string): boolean {
  if (s.length === 0) return true;
  let ok = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c === 9 || c === 10 || c === 13) ok++;
    else if (c >= 32 && c < 0xd800) ok++;
    else if (c >= 0xd800 && c <= 0xdfff) ok++;
    else if (c >= 0xe000 && c < 0xfffe) ok++;
  }
  return ok / s.length > 0.82;
}

// 预览解码：含 NUL 的 UTF-16（如 Windows 记事本「Unicode」）不再被误判为二进制。
function decodePreviewBuffer(slice: Buffer): { text: string; isBinary: boolean } {
  if (slice.length === 0) {
    return { text: '', isBinary: false };
  }

  if (slice.length >= 3 && slice[0] === 0xef && slice[1] === 0xbb && slice[2] === 0xbf) {
    return { text: slice.subarray(3).toString('utf8'), isBinary: false };
  }
  if (slice.length >= 2 && slice[0] === 0xff && slice[1] === 0xfe) {
    const body = slice.subarray(2);
    const dec = tryDecodeUtf16Le(body);
    if (dec != null) return { text: dec, isBinary: false };
    if (body.length % 2 === 0) return { text: body.toString('utf16le'), isBinary: false };
    return { text: body.toString('utf8'), isBinary: false };
  }
  if (slice.length >= 2 && slice[0] === 0xfe && slice[1] === 0xff) {
    const body = slice.subarray(2);
    const dec = tryDecodeUtf16Be(body);
    if (dec != null) return { text: dec, isBinary: false };
    if (body.length % 2 === 0) {
      const copy = Buffer.from(body);
      copy.swap16();
      return { text: copy.toString('utf16le'), isBinary: false };
    }
    return { text: body.toString('utf8'), isBinary: false };
  }

  const sampleLen = Math.min(8192, slice.length);
  const hasNul = slice.subarray(0, sampleLen).indexOf(0) >= 0;

  if (!hasNul) {
    return { text: slice.toString('utf8'), isBinary: false };
  }

  if (slice.length % 2 === 0) {
    const le = tryDecodeUtf16Le(slice);
    if (le != null) return { text: le, isBinary: false };
    const be = tryDecodeUtf16Be(slice);
    if (be != null) return { text: be, isBinary: false };
  }

  const utf8Text = slice.toString('utf8');
  if (isMostlyPrintableUtf8(utf8Text)) {
    return { text: utf8Text, isBinary: false };
  }

  return { text: '', isBinary: true };
}

import {
  LAUNCHER_STASH_DIR,
  launcherStashDirAbs,
} from './workspace-blob-store';
import { WORKSPACE_AGENT_DIR, workspaceAgentRootAbs } from './workspace-agent-layout';

function isPathUnderOrEqualDir(absChild: string, absParent: string): boolean {
  const rel = path.relative(absParent, absChild);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

export function resolvePathInsideWorkspace(workspaceRoot: string, relativePath: string): string {
  const root = path.resolve(workspaceRoot);
  const parts = String(relativePath || '')
    .replace(/\\/g, '/')
    .split('/')
    .filter((p) => p && p !== '.');
  if (parts.some((p) => p === '..')) {
    throw new Error('Invalid path');
  }
  const first = parts[0] ?? '';
  const tail = parts.slice(1);

  if (first === WORKSPACE_AGENT_DIR) {
    const base = workspaceAgentRootAbs(root);
    const full = path.resolve(base, ...tail);
    if (!isPathUnderOrEqualDir(full, base)) {
      throw new Error('Path escapes workspace');
    }
    return full;
  }
  if (first === LAUNCHER_STASH_DIR) {
    const base = launcherStashDirAbs(root);
    const full = path.resolve(base, ...tail);
    if (!isPathUnderOrEqualDir(full, base)) {
      throw new Error('Path escapes workspace');
    }
    return full;
  }

  const full = path.resolve(root, ...parts);
  const relToRoot = path.relative(root, full);
  if (relToRoot.startsWith('..') || path.isAbsolute(relToRoot)) {
    throw new Error('Path escapes workspace');
  }
  return full;
}

export async function listWorkspaceDirectory(
  workspaceRoot: string,
  relativePath: string
): Promise<Array<{ name: string; kind: 'file' | 'dir' }>> {
  const dir = resolvePathInsideWorkspace(workspaceRoot, relativePath);
  const st = await fs.promises.stat(dir).catch(() => null);
  if (!st?.isDirectory()) {
    throw new Error('Not a directory');
  }
  const entries = await fs.promises.readdir(dir, { withFileTypes: true });

  const rows = entries
    .map((e) => ({
      name: e.name,
      kind: (e.isDirectory() ? 'dir' : 'file') as 'file' | 'dir',
    }))
    .sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === 'dir' ? -1 : 1;
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    });

  return rows;
}

/** 源路径是否落在工作区根之下（含根自身），用于禁止「工作区内再拖进工作区」的歧义导入 */
function isPathInsideWorkspaceRoot(workspaceRoot: string, absoluteSource: string): boolean {
  const root = path.resolve(workspaceRoot);
  const src = path.resolve(absoluteSource);
  if (src === root) return true;
  const rel = path.relative(root, src);
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}

function isCrossDeviceRenameError(e: unknown): boolean {
  const err = e as NodeJS.ErrnoException & { syscall?: string };
  if (err?.code === 'EXDEV') return true;
  const msg = err instanceof Error ? err.message : String(e);
  return /cross-device|not the same device|不同的设备|无法将文件移到不同的磁盘/i.test(msg);
}

/**
 * 将操作系统路径下的文件/文件夹移动到工作区相对目录下（外部拖入）。
 * 同卷优先 `rename`（原子移动）；跨卷则复制到工作区后删除源路径。
 * 若目标已存在且 overwrite 为 true 则先删除再移动。
 */
async function moveOntoWorkspaceDest(src: string, dest: string, isDir: boolean): Promise<void> {
  try {
    await fs.promises.rename(src, dest);
    return;
  } catch (e: unknown) {
    if (!isCrossDeviceRenameError(e)) throw e;
    if (isDir) {
      await fs.promises.cp(src, dest, { recursive: true });
      await fs.promises.rm(src, { recursive: true, force: true });
    } else {
      await fs.promises.copyFile(src, dest);
      await fs.promises.unlink(src);
    }
  }
}

export async function importExternalPathsIntoWorkspace(
  workspaceRoot: string,
  targetRelativeDir: string,
  sourceAbsolutePaths: string[],
  options?: { overwrite?: boolean }
): Promise<{ ok: true } | { ok: false; error: string }> {
  const overwrite = options?.overwrite !== false;
  const rootResolved = path.resolve(workspaceRoot);
  let destDir: string;
  try {
    destDir = resolvePathInsideWorkspace(workspaceRoot, targetRelativeDir);
  } catch {
    return { ok: false, error: 'Invalid target folder' };
  }
  await fs.promises.mkdir(destDir, { recursive: true });

  const paths = sourceAbsolutePaths.map((p) => path.resolve(String(p || ''))).filter(Boolean);
  if (paths.length === 0) return { ok: false, error: 'No files to import' };

  for (const src of paths) {
    if (isPathInsideWorkspaceRoot(rootResolved, src)) {
      return { ok: false, error: 'Cannot import paths that already lie inside the workspace' };
    }

    const st = await fs.promises.stat(src).catch(() => null);
    if (!st) return { ok: false, error: `Source not found: ${src}` };

    const base = path.basename(src);
    if (!base || base === '.' || base === '..') return { ok: false, error: 'Invalid file name' };

    const dest = path.join(destDir, base);
    const destResolved = path.resolve(dest);
    const dirResolved = path.resolve(destDir);
    if (!destResolved.startsWith(dirResolved + path.sep) && destResolved !== dirResolved) {
      return { ok: false, error: 'Invalid destination' };
    }

    const exists = await fs.promises.stat(dest).catch(() => null);
    if (exists) {
      if (!overwrite) return { ok: false, error: `${base} already exists` };
      await fs.promises.rm(dest, { recursive: true, force: true });
    }

    await moveOntoWorkspaceDest(src, dest, st.isDirectory());
  }

  return { ok: true };
}

/** 对话拖入附件缓存目录名（位于 `.agent/.clawflow/` 下） */
export const CHAT_DROP_CACHE_DIRNAME = 'chat-drop-cache';

function makeUniqueChatDropDestName(originalBase: string): string {
  const ext = path.extname(originalBase);
  const stem = ext ? originalBase.slice(0, -ext.length) : originalBase;
  const safeStem = stem.replace(/[/\\?%*:|"<>]/g, '_').trim() || 'file';
  const short = safeStem.slice(0, 80);
  return `${short}__${Date.now().toString(36)}_${randomUUID().slice(0, 10)}${ext}`;
}

/**
 * 将绝对路径上的文件/目录**复制**到工作区 `.agent/.clawflow/chat-drop-cache/`，供会话引用。
 * 不删除源路径；目录递归复制。
 */
export async function copyExternalPathsToChatDropCache(
  workspaceRoot: string,
  sourceAbsolutePaths: string[]
): Promise<
  | { ok: true; items: Array<{ destAbs: string; displayName: string }> }
  | { ok: false; error: string }
> {
  const cacheRoot = path.join(clawflowDir(path.resolve(workspaceRoot)), CHAT_DROP_CACHE_DIRNAME);
  await fs.promises.mkdir(cacheRoot, { recursive: true });

  const paths = sourceAbsolutePaths.map((p) => path.resolve(String(p || ''))).filter(Boolean);
  if (paths.length === 0) return { ok: false, error: 'No files to copy' };

  const items: Array<{ destAbs: string; displayName: string }> = [];

  for (const src of paths) {
    const st = await fs.promises.stat(src).catch(() => null);
    if (!st) return { ok: false, error: `Source not found: ${src}` };

    const base = path.basename(src);
    if (!base || base === '.' || base === '..') return { ok: false, error: 'Invalid file name' };

    const destName = makeUniqueChatDropDestName(base);
    const dest = path.join(cacheRoot, destName);
    const destResolved = path.resolve(dest);
    const cacheResolved = path.resolve(cacheRoot);
    if (!destResolved.startsWith(cacheResolved + path.sep) && destResolved !== cacheResolved) {
      return { ok: false, error: 'Invalid destination' };
    }

    if (st.isDirectory()) {
      await fs.promises.cp(src, dest, { recursive: true });
    } else {
      await fs.promises.copyFile(src, dest);
    }
    items.push({ destAbs: destResolved, displayName: base });
  }

  return { ok: true, items };
}

export type FilePreviewResult =
  | {
      ok: true;
      content: string;
      truncated: boolean;
      isBinary: boolean;
      /** 为 true 时 `content` 为原始 Base64（无 data: 前缀），与 `mimeType` 拼 data URL */
      isImage?: boolean;
      /** PDF：content 为 Base64，内嵌预览；textExtract 供模型/工具读取文字层 */
      isPdf?: boolean;
      mimeType?: string;
      textExtract?: string;
      numpages?: number;
    }
  | { ok: false; error: string };

export async function readWorkspaceFilePreview(
  workspaceRoot: string,
  relativePath: string
): Promise<FilePreviewResult> {
  try {
    const full = resolvePathInsideWorkspace(workspaceRoot, relativePath);
    const st = await fs.promises.stat(full);
    if (!st.isFile()) {
      return { ok: false, error: 'Not a file' };
    }

    const ext = path.extname(full).toLowerCase();
    const imageMime = IMAGE_EXT_TO_MIME[ext];
    if (imageMime) {
      if (st.size > WORKSPACE_IMAGE_PREVIEW_MAX_BYTES) {
        return { ok: false, error: IMAGE_PREVIEW_TOO_LARGE };
      }
      const buf = await fs.promises.readFile(full);
      return {
        ok: true,
        content: buf.toString('base64'),
        truncated: false,
        isBinary: false,
        isImage: true,
        mimeType: imageMime,
      };
    }

    if (EXCEL_PREVIEW_EXTENSIONS.has(ext)) {
      if (st.size > WORKSPACE_OFFICE_PREVIEW_MAX_BYTES) {
        return { ok: false, error: 'File too large' };
      }
      try {
        const buf = await fs.promises.readFile(full);
        const { text, truncated } = previewExcelBuffer(buf);
        return { ok: true, content: text, truncated, isBinary: false };
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return { ok: false, error: msg };
      }
    }

    if (PDF_PREVIEW_EXTENSIONS.has(ext)) {
      if (st.size > WORKSPACE_OFFICE_PREVIEW_MAX_BYTES) {
        return { ok: false, error: 'File too large' };
      }
      try {
        const buf = await fs.promises.readFile(full);
        const p = await previewPdfBuffer(buf);
        return {
          ok: true,
          content: p.base64,
          truncated: p.truncated,
          isBinary: false,
          isPdf: true,
          mimeType: 'application/pdf',
          textExtract: p.textExtract,
          numpages: p.numpages,
        };
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return { ok: false, error: msg };
      }
    }

    if (st.size > FILE_HARD_MAX) {
      return { ok: false, error: 'File too large' };
    }

    const headLen = Math.min(16, st.size);
    const head = Buffer.alloc(headLen);
    if (headLen > 0) {
      const fh = await fs.promises.open(full, 'r');
      try {
        await fh.read(head, 0, headLen, 0);
      } finally {
        await fh.close();
      }
    }
    if (SQLITE_FILE_EXTENSIONS.has(ext) || isSqliteMagicHeader(head)) {
      return previewSqliteDatabaseFile(full, st.size);
    }

    const buf = await fs.promises.readFile(full);
    const truncated = buf.length > TEXT_PREVIEW_MAX;
    const slice = truncated ? buf.subarray(0, TEXT_PREVIEW_MAX) : buf;
    const { text, isBinary } = decodePreviewBuffer(slice);
    return { ok: true, content: text, truncated, isBinary };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}
