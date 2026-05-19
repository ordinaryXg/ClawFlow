/**
 * Hermes 技能在 UI 中的启用/禁用（不影响磁盘；模型侧 `workspace_skill_list` 会过滤已禁用项）。
 */

import * as fs from 'fs';
import * as path from 'path';
import * as workspaceService from './workspace-service';

const VERSION = 1 as const;

type FileShape = { version: typeof VERSION; disabledSkillRoots: string[] };

function statePath(workspaceRoot: string): string {
  return path.join(workspaceService.clawflowDir(workspaceRoot), 'skills-ui.v1.json');
}

function normalizeRootRel(rel: string): string {
  return String(rel ?? '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\/+/, '');
}

type DisabledRootsCacheEntry = { mtimeMs: number; disabled: Set<string> };

const disabledRootsCache = new Map<string, DisabledRootsCacheEntry>();

function parseDisabledRootsFromFile(fp: string): Set<string> {
  try {
    const raw = fs.readFileSync(fp, 'utf8');
    const j = JSON.parse(raw) as Partial<FileShape>;
    const arr = j?.disabledSkillRoots;
    if (!Array.isArray(arr)) return new Set();
    return new Set(arr.filter((x) => typeof x === 'string').map((x) => normalizeRootRel(x)));
  } catch {
    return new Set();
  }
}

export function readDisabledSkillRootsSync(workspaceRoot: string): Set<string> {
  const root = path.resolve(workspaceRoot);
  const fp = statePath(root);
  let mtimeMs = -1;
  try {
    mtimeMs = fs.statSync(fp).mtimeMs;
  } catch {
    /* missing file */
  }
  const hit = disabledRootsCache.get(root);
  if (hit && hit.mtimeMs === mtimeMs) {
    return hit.disabled;
  }
  const disabled = parseDisabledRootsFromFile(fp);
  disabledRootsCache.set(root, { mtimeMs, disabled });
  return disabled;
}

export async function setSkillRootEnabled(workspaceRoot: string, skillRootRel: string, enabled: boolean): Promise<void> {
  const root = path.resolve(workspaceRoot);
  const rel = normalizeRootRel(skillRootRel);
  if (!rel) throw new Error('missing skillRootRel');
  const dir = workspaceService.clawflowDir(root);
  await fs.promises.mkdir(dir, { recursive: true });
  const fp = statePath(root);
  let disabled = [...readDisabledSkillRootsSync(root)];
  const set = new Set(disabled.map((x) => normalizeRootRel(x)));
  if (enabled) set.delete(rel);
  else set.add(rel);
  disabled = [...set].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  const body: FileShape = { version: VERSION, disabledSkillRoots: disabled };
  await fs.promises.writeFile(fp, JSON.stringify(body, null, 2), 'utf8');
  let mtimeMs = Date.now();
  try {
    mtimeMs = (await fs.promises.stat(fp)).mtimeMs;
  } catch {
    /* ignore */
  }
  disabledRootsCache.set(root, { mtimeMs, disabled: set });
}
