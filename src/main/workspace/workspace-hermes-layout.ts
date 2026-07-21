/**
 * Hermes：`.agent/.hermes/index/` 存放 SQLite 索引；记忆条目仅存于索引（逻辑路径 `.agent/.hermes/memory/`）。
 */
import * as fs from 'fs';
import * as path from 'path';
import { workspaceAgentRootAbs } from './workspace-agent-layout';
import { seedHermesMemoryReadmeIfEmpty } from '../../engine/hermes/hermes-memory-store';

export const WORKSPACE_HERMES_REL = '.agent/.hermes';
export const WORKSPACE_HERMES_INDEX_REL = '.agent/.hermes/index';
export const HERMES_MEMORY_REL_PREFIX = '.agent/.hermes/memory';
export const WORKSPACE_HERMES_CHAT_DIGEST_REL = '.agent/.hermes/memory/_chat-digest';
export const HERMES_MEMORY_DB_FILENAME = 'hermes-memory.db';

function resolvedWorkspaceRoot(workspaceRoot: string): string {
  return path.resolve(String(workspaceRoot ?? '').trim());
}

export function workspaceHermesRootAbs(workspaceRoot: string): string {
  return path.join(workspaceAgentRootAbs(workspaceRoot), '.hermes');
}

export function workspaceHermesIndexDirAbs(workspaceRoot: string): string {
  return path.join(workspaceHermesRootAbs(workspaceRoot), 'index');
}

export function getHermesMemoryDbPath(workspaceRoot: string): string {
  return path.join(workspaceHermesIndexDirAbs(workspaceRoot), HERMES_MEMORY_DB_FILENAME);
}

export function isHermesNotesWorkspaceRel(rel: string): boolean {
  try {
    const { isHermesMemoryRel } = require('../../engine/hermes/hermes-memory-store') as typeof import('../../engine/hermes/hermes-memory-store');
    return isHermesMemoryRel(rel);
  } catch {
    return false;
  }
}

/** 确保 Hermes 索引目录存在，并在空库时写入 README 占位。 */
export function ensureHermesLayoutSync(workspaceRoot: string): void {
  const root = resolvedWorkspaceRoot(workspaceRoot);
  const hermes = workspaceHermesRootAbs(root);
  const indexDir = workspaceHermesIndexDirAbs(root);

  try {
    fs.mkdirSync(hermes, { recursive: true });
    fs.mkdirSync(indexDir, { recursive: true });
    seedHermesMemoryReadmeIfEmpty(root);
  } catch (e) {
    console.warn('[workspace-hermes-layout] ensure failed:', e);
  }
}
