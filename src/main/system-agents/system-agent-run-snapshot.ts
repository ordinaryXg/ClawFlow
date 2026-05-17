import * as fs from 'fs';
import * as path from 'path';
import type { SubAgentRunSnapshot, SubAgentRunSnapshotStatus } from '../../shared/sub-agent-types';
import { systemClawflowDirAbs } from './system-agent-layout';

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

function filePath(): string {
  return path.join(systemClawflowDirAbs(), 'sub-agent-runs.v1.json');
}

async function readFileShape(): Promise<FileShape> {
  try {
    const buf = await fs.promises.readFile(filePath(), 'utf8');
    const j = JSON.parse(buf) as Partial<FileShape>;
    if (j?.bySlotId && typeof j.bySlotId === 'object') {
      return { version: VERSION, bySlotId: { ...j.bySlotId } };
    }
  } catch {
    /* missing */
  }
  return { version: VERSION, bySlotId: {} };
}

export async function readSystemRunSnapshot(slotId: string): Promise<SubAgentRunSnapshot | null> {
  const id = String(slotId ?? '').trim();
  if (!id) return null;
  const shape = await readFileShape();
  const row = shape.bySlotId[id];
  if (!row) return null;
  return {
    status: row.status,
    taskText: row.taskText,
    conversationId: row.conversationId,
    logTail: row.logTail,
    updatedAt: row.updatedAt,
  };
}

export async function readAllSystemRunSnapshots(): Promise<Record<string, SubAgentRunSnapshot>> {
  const shape = await readFileShape();
  const out: Record<string, SubAgentRunSnapshot> = {};
  for (const [id, row] of Object.entries(shape.bySlotId)) {
    out[id] = {
      status: row.status,
      taskText: row.taskText,
      conversationId: row.conversationId,
      logTail: row.logTail,
      updatedAt: row.updatedAt,
    };
  }
  return out;
}

export async function writeSystemRunSnapshot(
  slotId: string,
  patch: Partial<SubAgentRunSnapshot> & Pick<SubAgentRunSnapshot, 'status'>
): Promise<void> {
  const id = String(slotId ?? '').trim();
  if (!id) return;
  const shape = await readFileShape();
  const prev = shape.bySlotId[id];
  shape.bySlotId[id] = {
    status: patch.status,
    taskText: patch.taskText ?? prev?.taskText ?? '',
    conversationId: patch.conversationId ?? prev?.conversationId ?? '',
    logTail: patch.logTail ?? prev?.logTail ?? '',
    updatedAt: patch.updatedAt ?? Date.now(),
  };
  await fs.promises.mkdir(systemClawflowDirAbs(), { recursive: true });
  await fs.promises.writeFile(filePath(), JSON.stringify(shape, null, 2), 'utf8');
}
