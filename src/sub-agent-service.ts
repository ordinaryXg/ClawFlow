import * as fs from 'fs';
import * as path from 'path';
import type { SubAgentSlot } from './shared/sub-agent-types';
import * as workspaceService from './workspace-service';

export type { SubAgentSlot, SubAgentRunStatus } from './shared/sub-agent-types';

const FILE_VERSION = 1 as const;

type FileShape = { version: typeof FILE_VERSION; slots: SubAgentSlot[] };

function storePath(workspaceRoot: string): string {
  return path.join(workspaceService.clawflowDir(workspaceRoot), 'sub-agents.v1.json');
}

function isSlot(x: unknown): x is SubAgentSlot {
  if (!x || typeof x !== 'object') return false;
  const o = x as Record<string, unknown>;
  if (typeof o.id !== 'string' || typeof o.label !== 'string' || typeof o.behavior !== 'string') return false;
  const st = o.status;
  return st === 'stopped' || st === 'starting' || st === 'running' || st === 'error';
}

/** 供 IPC / 渲染进程写入前清洗 */
export function coerceSubAgentSlotsPayload(raw: unknown): SubAgentSlot[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(isSlot);
}

export async function readSubAgentSlots(workspaceRoot: string): Promise<SubAgentSlot[]> {
  const root = path.resolve(workspaceRoot);
  const fp = storePath(root);
  try {
    const buf = await fs.promises.readFile(fp, 'utf-8');
    const parsed = JSON.parse(buf) as unknown;
    if (parsed && typeof parsed === 'object') {
      const slots = (parsed as FileShape).slots;
      if (Array.isArray(slots)) return slots.filter(isSlot);
    }
  } catch {
    /* missing */
  }
  return [];
}

export async function writeSubAgentSlots(workspaceRoot: string, slots: SubAgentSlot[]): Promise<void> {
  const root = path.resolve(workspaceRoot);
  const dir = workspaceService.clawflowDir(root);
  await fs.promises.mkdir(dir, { recursive: true });
  const body: FileShape = { version: FILE_VERSION, slots };
  await fs.promises.writeFile(storePath(root), JSON.stringify(body, null, 2), 'utf-8');
}
