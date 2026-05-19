/**
 * `.agent/.clawflow/knowledge-manifest.json` — 知识库文件清单（由磁盘扫描生成，可重建）。
 */

import * as fs from 'fs';
import * as path from 'path';
import { clawflowDir } from './workspace-service';
import { workspaceAgentKnowledgeDirAbs } from './workspace-agent-layout';
import { knowledgeIngestDirAbs } from './workspace-knowledge-ingest';
import { parseWorkspaceMemoryMarkdown } from '../../shared/workspace-memory-frontmatter';

export const KNOWLEDGE_MANIFEST_VERSION = 1 as const;

export type KnowledgeManifestEntry = {
  /** 相对工作区根，POSIX */
  path: string;
  ext: string;
  sizeBytes: number;
  mtimeMs: number;
  title: string | null;
  abstract: string | null;
};

export type KnowledgeManifest = {
  version: typeof KNOWLEDGE_MANIFEST_VERSION;
  updatedAt: number;
  entries: KnowledgeManifestEntry[];
};

const TEXT_EXT = new Set(['.md', '.txt']);

function toPosixRel(workspaceRoot: string, absPath: string): string {
  return path.relative(path.resolve(workspaceRoot), absPath).split(path.sep).join('/');
}

function knowledgeManifestPath(workspaceRoot: string): string {
  return path.join(clawflowDir(workspaceRoot), 'knowledge-manifest.json');
}

function inferTitleFromFile(relPosix: string, parsedTitle?: string): string {
  if (parsedTitle?.trim()) return parsedTitle.trim();
  const base = path.posix.basename(relPosix);
  const stem = base.replace(/\.[^.]+$/, '');
  return stem || base;
}

function scanKnowledgeFiles(workspaceRoot: string): KnowledgeManifestEntry[] {
  const root = path.resolve(workspaceRoot);
  const knowledgeRoot = workspaceAgentKnowledgeDirAbs(root);
  const out: KnowledgeManifestEntry[] = [];

  function walk(dir: string): void {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      const abs = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        walk(abs);
      } else if (ent.isFile()) {
        const ext = path.extname(ent.name).toLowerCase();
        if (!TEXT_EXT.has(ext)) continue;
        let st: fs.Stats;
        try {
          st = fs.statSync(abs);
        } catch {
          continue;
        }
        const relPosix = toPosixRel(root, abs);
        let title: string | null = null;
        let abstract: string | null = null;
        if (ext === '.md') {
          try {
            const raw = fs.readFileSync(abs, 'utf8');
            const parsed = parseWorkspaceMemoryMarkdown(raw);
            title = inferTitleFromFile(relPosix, parsed.title);
            abstract = parsed.abstract ?? null;
          } catch {
            title = inferTitleFromFile(relPosix);
          }
        } else {
          title = inferTitleFromFile(relPosix);
        }
        out.push({
          path: relPosix,
          ext,
          sizeBytes: st.size,
          mtimeMs: Math.trunc(st.mtimeMs),
          title,
          abstract,
        });
      }
    }
  }

  try {
    fs.accessSync(knowledgeRoot);
    walk(knowledgeRoot);
  } catch {
    /* knowledge dir optional */
  }
  try {
    const ingestRoot = knowledgeIngestDirAbs(root);
    fs.accessSync(ingestRoot);
    walk(ingestRoot);
  } catch {
    /* ingest dir optional */
  }
  out.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return out;
}

export function rebuildKnowledgeManifest(workspaceRoot: string): KnowledgeManifest {
  const entries = scanKnowledgeFiles(workspaceRoot);
  const manifest: KnowledgeManifest = {
    version: KNOWLEDGE_MANIFEST_VERSION,
    updatedAt: Date.now(),
    entries,
  };
  const outPath = knowledgeManifestPath(workspaceRoot);
  try {
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(manifest, null, 2), 'utf8');
  } catch (e) {
    console.warn('[knowledge-manifest] write failed:', e);
  }
  return manifest;
}

export function readKnowledgeManifestSync(workspaceRoot: string): KnowledgeManifest | null {
  const p = knowledgeManifestPath(workspaceRoot);
  try {
    const raw = fs.readFileSync(p, 'utf8');
    const j = JSON.parse(raw) as KnowledgeManifest;
    if (!j || typeof j !== 'object' || !Array.isArray(j.entries)) return null;
    return j;
  } catch {
    return null;
  }
}

export function listKnowledgeManifestEntries(workspaceRoot: string): KnowledgeManifestEntry[] {
  const cached = readKnowledgeManifestSync(workspaceRoot);
  if (cached?.entries?.length) return cached.entries;
  return rebuildKnowledgeManifest(workspaceRoot).entries;
}
