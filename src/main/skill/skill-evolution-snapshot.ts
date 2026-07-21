/**
 * 进化相关路径的快照、diff 与备份恢复（Hermes 记忆、`.agent/.skills`、角色文档）。
 */

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { evolutionBackupsDirAbs } from '../workspace/workspace-evolution-layout';
import { workspaceRoleAgentDirAbs, workspaceSkillsDirAbs } from '../workspace/workspace-agent-layout';
import { snapshotHermesMemoryDocuments } from '../../engine/hermes/hermes-memory-store';

export type EvolutionDiffKind = 'added' | 'modified' | 'deleted';

export type EvolutionDiffEntry = {
  relPath: string;
  kind: EvolutionDiffKind;
  /** 变更后内容摘要（删除时为空） */
  afterSnippet?: string;
};

/** 相对工作区根的 POSIX 路径 → 文件 UTF-8 内容 */
export type EvolutionFileSnapshot = Record<string, string>;

const ROLE_DOC_NAMES = new Set(['AGENTS.md', 'SOUL.md']);

function toPosixRel(workspaceRoot: string, abs: string): string {
  const rel = path.relative(path.resolve(workspaceRoot), abs);
  return rel.split(path.sep).join('/');
}

async function walkFiles(
  dirAbs: string,
  workspaceRoot: string,
  accept: (absFile: string) => boolean,
  out: EvolutionFileSnapshot
): Promise<void> {
  let names: string[];
  try {
    names = await fs.promises.readdir(dirAbs);
  } catch {
    return;
  }
  for (const name of names) {
    const abs = path.join(dirAbs, name);
    let st: fs.Stats;
    try {
      st = await fs.promises.lstat(abs);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      await walkFiles(abs, workspaceRoot, accept, out);
      continue;
    }
    if (!st.isFile() || !accept(abs)) continue;
    const rel = toPosixRel(workspaceRoot, abs);
    try {
      const buf = await fs.promises.readFile(abs);
      if (buf.length > 2_000_000) continue;
      out[rel] = buf.toString('utf8');
    } catch {
      /* skip unreadable */
    }
  }
}

/** 采集进化验收范围内的工作区文件快照 */
export async function snapshotEvolutionWorkspace(workspaceRoot: string): Promise<EvolutionFileSnapshot> {
  const root = path.resolve(workspaceRoot);
  const out: EvolutionFileSnapshot = {};

  Object.assign(out, snapshotHermesMemoryDocuments(root));

  await walkFiles(workspaceSkillsDirAbs(root), root, () => true, out);

  const roleDir = workspaceRoleAgentDirAbs(root);
  await walkFiles(roleDir, root, (p) => {
    const base = path.basename(p);
    return ROLE_DOC_NAMES.has(base);
  }, out);

  return out;
}

export function diffEvolutionSnapshots(
  before: EvolutionFileSnapshot,
  after: EvolutionFileSnapshot
): EvolutionDiffEntry[] {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const diffs: EvolutionDiffEntry[] = [];
  for (const relPath of [...keys].sort()) {
    const b = before[relPath];
    const a = after[relPath];
    if (b === undefined && a !== undefined) {
      diffs.push({ relPath, kind: 'added', afterSnippet: snippet(a) });
    } else if (b !== undefined && a === undefined) {
      diffs.push({ relPath, kind: 'deleted' });
    } else if (b !== undefined && a !== undefined && b !== a) {
      diffs.push({ relPath, kind: 'modified', afterSnippet: snippet(a) });
    }
  }
  return diffs;
}

function snippet(text: string, max = 240): string {
  const s = text.replace(/\r\n/g, '\n').trim();
  if (s.length <= max) return s;
  return `${s.slice(0, max)}…`;
}

export function evolutionDiffHasChanges(diff: EvolutionDiffEntry[]): boolean {
  return diff.length > 0;
}

export function formatEvolutionDiffLines(diff: EvolutionDiffEntry[], maxLines = 40): string {
  const lines = diff.slice(0, maxLines).map((d) => {
    const tag = d.kind === 'added' ? '+' : d.kind === 'deleted' ? '-' : '~';
    return `${tag} ${d.relPath}`;
  });
  if (diff.length > maxLines) lines.push(`… 另有 ${diff.length - maxLines} 项`);
  return lines.join('\n');
}

function evolutionBackupsDir(workspaceRoot: string): string {
  return evolutionBackupsDirAbs(workspaceRoot);
}

export type EvolutionBackupManifest = {
  version: 1;
  runId: string;
  at: number;
  /** 备份时存在的相对路径（POSIX） */
  files: string[];
};

/** 在进化开始前备份相关目录，供失败或撤销时恢复 */
export async function backupEvolutionWorkspace(workspaceRoot: string, runId: string): Promise<string> {
  const root = path.resolve(workspaceRoot);
  const id = String(runId).trim();
  const dir = path.join(evolutionBackupsDir(root), id);
  const filesDir = path.join(dir, 'files');
  await fs.promises.mkdir(filesDir, { recursive: true });

  const snap = await snapshotEvolutionWorkspace(root);
  const files: string[] = [];
  for (const [rel, content] of Object.entries(snap)) {
    const dest = path.join(filesDir, rel.split('/').join(path.sep));
    await fs.promises.mkdir(path.dirname(dest), { recursive: true });
    await fs.promises.writeFile(dest, content, 'utf8');
    files.push(rel);
  }

  const manifest: EvolutionBackupManifest = { version: 1, runId: id, at: Date.now(), files };
  await fs.promises.writeFile(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
  return dir;
}

/** 将工作区进化路径恢复为指定 run 的备份；并删除备份后新增的文件 */
export async function restoreEvolutionBackup(workspaceRoot: string, runId: string): Promise<void> {
  const root = path.resolve(workspaceRoot);
  const id = String(runId).trim();
  const dir = path.join(evolutionBackupsDir(root), id);
  const manifestPath = path.join(dir, 'manifest.json');
  let manifest: EvolutionBackupManifest;
  try {
    const raw = await fs.promises.readFile(manifestPath, 'utf8');
    manifest = JSON.parse(raw) as EvolutionBackupManifest;
  } catch {
    throw new Error('evolution_backup_not_found');
  }

  const backed = new Set(manifest.files);
  const current = await snapshotEvolutionWorkspace(root);
  for (const rel of Object.keys(current)) {
    if (!backed.has(rel)) {
      const abs = path.join(root, rel.split('/').join(path.sep));
      await fs.promises.rm(abs, { force: true }).catch(() => undefined);
    }
  }

  const filesDir = path.join(dir, 'files');
  for (const rel of manifest.files) {
    const src = path.join(filesDir, rel.split('/').join(path.sep));
    const dest = path.join(root, rel.split('/').join(path.sep));
    try {
      const content = await fs.promises.readFile(src, 'utf8');
      await fs.promises.mkdir(path.dirname(dest), { recursive: true });
      await fs.promises.writeFile(dest, content, 'utf8');
    } catch {
      await fs.promises.rm(dest, { force: true }).catch(() => undefined);
    }
  }
}

export function evolutionRunId(): string {
  return crypto.randomUUID();
}
