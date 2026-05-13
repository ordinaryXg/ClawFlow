/**
 * 工作空间变更记录：对话轮次、文件操作、进化 Agent、待办、子 Agent 调度、技能开关等。
 * 存于 `.agent/.clawflow/change-history.json`。
 */

import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { BrowserWindow } from 'electron';
import { clawflowDir } from './workspace-service';
import * as workspaceService from './workspace-service';
import { resolveWorkspaceRootForWebContents } from '../electron-workspace-context';

/** 与右侧「变更记录表」分类一致；旧数据缺省为 conversation_round */
export type WorkspaceChangeLogKind =
  | 'conversation_round'
  | 'file_change'
  | 'evolution'
  | 'todo_added'
  | 'todo_triggered'
  | 'agent_dispatch'
  | 'skill_enabled'
  | 'skill_disabled'
  | 'skill_deleted';

const KIND_SET = new Set<string>([
  'conversation_round',
  'file_change',
  'evolution',
  'todo_added',
  'todo_triggered',
  'agent_dispatch',
  'skill_enabled',
  'skill_disabled',
  'skill_deleted',
]);

export interface WorkspaceChangeLogEntry {
  id: string;
  at: number;
  kind: WorkspaceChangeLogKind;
  conversationId: string;
  /** 列表主标题 */
  title: string;
  /** 主摘要/上下文（原「用户侧」列，按类型语义复用） */
  userPreview: string;
  /** 详情/结果（原「助手侧」列，按类型语义复用） */
  assistantExcerpt: string;
  meta?: Record<string, unknown>;
}

const FILENAME = 'change-history.json';
const MAX_ENTRIES = 200;

type StoreFile = { version: 1; entries: WorkspaceChangeLogEntry[] };

function storePath(workspaceRoot: string): string {
  return path.join(clawflowDir(workspaceRoot), FILENAME);
}

function coerceKind(raw: unknown): WorkspaceChangeLogKind {
  const s = typeof raw === 'string' ? raw.trim() : '';
  if (s && KIND_SET.has(s)) return s as WorkspaceChangeLogKind;
  return 'conversation_round';
}

function normalizeEntry(raw: unknown): WorkspaceChangeLogEntry | null {
  if (!raw || typeof raw !== 'object') return null;
  const e = raw as Record<string, unknown>;
  if (typeof e.id !== 'string' || typeof e.at !== 'number') return null;
  const kind = coerceKind(e.kind);
  const title = typeof e.title === 'string' ? e.title : '';
  const userPreview = typeof e.userPreview === 'string' ? e.userPreview : '';
  const assistantExcerpt = typeof e.assistantExcerpt === 'string' ? e.assistantExcerpt : '';
  const conversationId = typeof e.conversationId === 'string' ? e.conversationId : '';
  const meta = e.meta && typeof e.meta === 'object' && !Array.isArray(e.meta) ? (e.meta as Record<string, unknown>) : undefined;
  return {
    id: e.id,
    at: e.at,
    kind,
    conversationId,
    title: title || (userPreview.split(/\r?\n/)[0] ?? '').slice(0, 120) || assistantExcerpt.slice(0, 80) || '—',
    userPreview,
    assistantExcerpt,
    ...(meta ? { meta } : {}),
  };
}

async function readStore(workspaceRoot: string): Promise<StoreFile> {
  const p = storePath(workspaceRoot);
  try {
    const raw = await fs.promises.readFile(p, 'utf-8');
    const j = JSON.parse(raw) as StoreFile;
    if (!j || typeof j !== 'object' || !Array.isArray(j.entries)) {
      return { version: 1, entries: [] };
    }
    const entries = j.entries.map(normalizeEntry).filter((x): x is WorkspaceChangeLogEntry => Boolean(x));
    return { version: 1, entries };
  } catch {
    return { version: 1, entries: [] };
  }
}

async function writeStore(workspaceRoot: string, data: StoreFile): Promise<void> {
  const p = storePath(workspaceRoot);
  await fs.promises.mkdir(path.dirname(p), { recursive: true });
  await fs.promises.writeFile(p, JSON.stringify(data, null, 2), 'utf-8');
}

export function broadcastWorkspaceChangelogUpdated(workspaceRoot: string): void {
  const resolved = path.resolve(workspaceRoot);
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed()) continue;
    try {
      const wc = win.webContents;
      if (workspaceService.isSameWorkspacePath(resolveWorkspaceRootForWebContents(wc), resolved)) {
        wc.send('workspace:changelogUpdated');
      }
    } catch {
      /* ignore */
    }
  }
}

export type AppendWorkspaceChangeLogParams = {
  conversationId?: string;
  userPreview: string;
  assistantExcerpt: string;
  /** 缺省为 conversation_round（主对话摘要） */
  kind?: WorkspaceChangeLogKind;
  /** 若为空则按 kind 自动生成短标题 */
  title?: string;
  meta?: Record<string, unknown>;
};

function defaultTitleForKind(kind: WorkspaceChangeLogKind, userPreview: string, assistantExcerpt: string): string {
  const u = userPreview.split(/\r?\n/)[0]?.trim() ?? '';
  const a = assistantExcerpt.split(/\r?\n/)[0]?.trim() ?? '';
  switch (kind) {
    case 'file_change':
      return (u || a || '文件变更').slice(0, 120);
    case 'evolution':
      return (u || '进化 Agent').slice(0, 120);
    case 'todo_added':
      return (u || '待办新增').slice(0, 120);
    case 'todo_triggered':
      return (u || '待办触发').slice(0, 120);
    case 'agent_dispatch':
      return (u || 'Agent 调度').slice(0, 120);
    case 'skill_enabled':
    case 'skill_disabled':
    case 'skill_deleted':
      return (u || a || '技能').slice(0, 120);
    default:
      return (u || a || '对话').slice(0, 120);
  }
}

export async function appendWorkspaceChangeLog(
  workspaceRoot: string,
  params: AppendWorkspaceChangeLogParams
): Promise<WorkspaceChangeLogEntry> {
  const kind = params.kind ?? 'conversation_round';
  const userPreview = String(params.userPreview ?? '').trim();
  const assistantExcerpt = String(params.assistantExcerpt ?? '').trim();
  const titleRaw = String(params.title ?? '').trim();
  const title = (titleRaw || defaultTitleForKind(kind, userPreview, assistantExcerpt)).slice(0, 200);

  const entry: WorkspaceChangeLogEntry = {
    id: randomUUID(),
    at: Date.now(),
    kind,
    conversationId: String(params.conversationId ?? ''),
    title,
    userPreview: userPreview.slice(0, 2000),
    assistantExcerpt: assistantExcerpt.slice(0, 4000),
    ...(params.meta && Object.keys(params.meta).length ? { meta: params.meta } : {}),
  };

  const store = await readStore(workspaceRoot);
  store.entries.unshift(entry);
  if (store.entries.length > MAX_ENTRIES) {
    store.entries = store.entries.slice(0, MAX_ENTRIES);
  }
  await writeStore(workspaceRoot, store);
  broadcastWorkspaceChangelogUpdated(workspaceRoot);
  return entry;
}

export async function getWorkspaceChangeLog(
  workspaceRoot: string,
  limit = 100
): Promise<WorkspaceChangeLogEntry[]> {
  const store = await readStore(workspaceRoot);
  return store.entries.slice(0, Math.max(0, Math.min(limit, MAX_ENTRIES)));
}
