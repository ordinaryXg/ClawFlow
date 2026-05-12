/**
 * 子 Agent 手动运行任务快照：持久化任务文本、关联会话、日志尾部与状态，便于重启后查看。
 */

import * as fs from 'fs';
import * as path from 'path';
import * as workspaceService from './workspace-service';
import type { SubAgentRunSnapshot, SubAgentRunSnapshotStatus } from './shared/sub-agent-types';

const VERSION = 1 as const;

type FileShape = {
  version: typeof VERSION;
  bySlotId: Record<
    string,
    {
      status: SubAgentRunSnapshotStatus;
      taskText: string;
      conversationId: string;
      logTail: string;
      updatedAt: number;
    }
  >;
};

function filePath(workspaceRoot: string): string {
  return path.join(workspaceService.clawflowDir(workspaceRoot), 'sub-agent-runs.v1.json');
}

function emptyShape(): FileShape {
  return { version: VERSION, bySlotId: {} };
}

async function readFileShape(workspaceRoot: string): Promise<FileShape> {
  const root = path.resolve(workspaceRoot);
  const fp = filePath(root);
  try {
    const buf = await fs.promises.readFile(fp, 'utf8');
    const j = JSON.parse(buf) as Partial<FileShape>;
    if (j && typeof j === 'object' && j.bySlotId && typeof j.bySlotId === 'object') {
      return { version: VERSION, bySlotId: { ...j.bySlotId } };
    }
  } catch {
    /* missing */
  }
  return emptyShape();
}

/** 启动时把上次未正常结束的 running 标为 interrupted 并写回 */
export async function reconcileRunSnapshotsAfterRestart(workspaceRoot: string): Promise<void> {
  const root = path.resolve(workspaceRoot);
  const shape = await readFileShape(root);
  let dirty = false;
  for (const k of Object.keys(shape.bySlotId)) {
    const row = shape.bySlotId[k];
    if (row && row.status === 'running') {
      shape.bySlotId[k] = { ...row, status: 'interrupted', updatedAt: Date.now() };
      dirty = true;
    }
  }
  if (!dirty) return;
  const dir = workspaceService.clawflowDir(root);
  await fs.promises.mkdir(dir, { recursive: true });
  await fs.promises.writeFile(filePath(root), JSON.stringify(shape, null, 2), 'utf8');
}

export async function readRunSnapshots(workspaceRoot: string): Promise<Record<string, SubAgentRunSnapshot>> {
  const shape = await readFileShape(path.resolve(workspaceRoot));
  const out: Record<string, SubAgentRunSnapshot> = {};
  for (const [slotId, row] of Object.entries(shape.bySlotId)) {
    if (!row || typeof row !== 'object') continue;
    const st = row.status;
    if (st !== 'idle' && st !== 'running' && st !== 'completed' && st !== 'error' && st !== 'interrupted') continue;
    out[slotId] = {
      status: st,
      taskText: String(row.taskText ?? ''),
      conversationId: String(row.conversationId ?? ''),
      logTail: String(row.logTail ?? ''),
      updatedAt: typeof row.updatedAt === 'number' ? row.updatedAt : 0,
    };
  }
  return out;
}

export async function writeRunSnapshot(
  workspaceRoot: string,
  slotId: string,
  patch: Partial<SubAgentRunSnapshot> & Pick<SubAgentRunSnapshot, 'status'>
): Promise<void> {
  const root = path.resolve(workspaceRoot);
  const id = String(slotId ?? '').trim();
  if (!id) return;
  const shape = await readFileShape(root);
  const prev = shape.bySlotId[id];
  const next: SubAgentRunSnapshot = {
    status: patch.status,
    taskText: patch.taskText ?? prev?.taskText ?? '',
    conversationId: patch.conversationId ?? prev?.conversationId ?? '',
    logTail: patch.logTail ?? prev?.logTail ?? '',
    updatedAt: patch.updatedAt ?? Date.now(),
  };
  shape.bySlotId[id] = next;
  const dir = workspaceService.clawflowDir(root);
  await fs.promises.mkdir(dir, { recursive: true });
  await fs.promises.writeFile(filePath(root), JSON.stringify(shape, null, 2), 'utf8');
}
