/**
 * 工作空间内「对话相关变更」记录（类似简化的 git log，存于 .clawflow/change-history.json）。
 */

import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { clawflowDir } from './workspace-service';

export interface WorkspaceChangeLogEntry {
  id: string;
  at: number;
  conversationId: string;
  /** 单行标题（用户首句摘要） */
  title: string;
  /** 用户输入摘要 */
  userPreview: string;
  /** 助手回复摘要 */
  assistantExcerpt: string;
}

const FILENAME = 'change-history.json';
const MAX_ENTRIES = 200;

type StoreFile = { version: 1; entries: WorkspaceChangeLogEntry[] };

function storePath(workspaceRoot: string): string {
  return path.join(clawflowDir(workspaceRoot), FILENAME);
}

async function readStore(workspaceRoot: string): Promise<StoreFile> {
  const p = storePath(workspaceRoot);
  try {
    const raw = await fs.promises.readFile(p, 'utf-8');
    const j = JSON.parse(raw) as StoreFile;
    if (!j || typeof j !== 'object' || !Array.isArray(j.entries)) {
      return { version: 1, entries: [] };
    }
    return { version: 1, entries: j.entries.filter(Boolean) };
  } catch {
    return { version: 1, entries: [] };
  }
}

async function writeStore(workspaceRoot: string, data: StoreFile): Promise<void> {
  const p = storePath(workspaceRoot);
  await fs.promises.mkdir(path.dirname(p), { recursive: true });
  await fs.promises.writeFile(p, JSON.stringify(data, null, 2), 'utf-8');
}

export async function appendWorkspaceChangeLog(
  workspaceRoot: string,
  params: { conversationId: string; userPreview: string; assistantExcerpt: string }
): Promise<WorkspaceChangeLogEntry> {
  const userPreview = String(params.userPreview ?? '').trim();
  const assistantExcerpt = String(params.assistantExcerpt ?? '').trim();
  const firstLine = userPreview.split(/\r?\n/)[0] ?? '';
  const title = (firstLine || assistantExcerpt || '对话').slice(0, 120);

  const entry: WorkspaceChangeLogEntry = {
    id: randomUUID(),
    at: Date.now(),
    conversationId: String(params.conversationId ?? ''),
    title,
    userPreview: userPreview.slice(0, 2000),
    assistantExcerpt: assistantExcerpt.slice(0, 4000),
  };

  const store = await readStore(workspaceRoot);
  store.entries.unshift(entry);
  if (store.entries.length > MAX_ENTRIES) {
    store.entries = store.entries.slice(0, MAX_ENTRIES);
  }
  await writeStore(workspaceRoot, store);
  return entry;
}

export async function getWorkspaceChangeLog(
  workspaceRoot: string,
  limit = 100
): Promise<WorkspaceChangeLogEntry[]> {
  const store = await readStore(workspaceRoot);
  return store.entries.slice(0, Math.max(0, Math.min(limit, MAX_ENTRIES)));
}
