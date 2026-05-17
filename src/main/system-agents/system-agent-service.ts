import * as fs from 'fs';
import * as path from 'path';
import type { SubAgentSlot } from '../../shared/sub-agent-types';
import { systemClawflowDirAbs } from './system-agent-layout';

const FILE_VERSION = 1 as const;

type FileShape = { version: typeof FILE_VERSION; slots: SubAgentSlot[] };

function storePath(): string {
  return path.join(systemClawflowDirAbs(), 'sub-agents.v1.json');
}

function isSlot(x: unknown): x is SubAgentSlot {
  if (!x || typeof x !== 'object') return false;
  const o = x as Record<string, unknown>;
  if (typeof o.id !== 'string' || typeof o.label !== 'string' || typeof o.behavior !== 'string') return false;
  const st = o.status;
  if (!(st === 'stopped' || st === 'starting' || st === 'running' || st === 'error')) return false;
  const ste = o.skillToolsEnabled;
  if (ste !== undefined && ste !== true && ste !== false) return false;
  return true;
}

export async function readSystemSubAgentSlots(): Promise<SubAgentSlot[]> {
  const fp = storePath();
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

export async function writeSystemSubAgentSlots(slots: SubAgentSlot[]): Promise<void> {
  const dir = systemClawflowDirAbs();
  await fs.promises.mkdir(dir, { recursive: true });
  const body: FileShape = { version: FILE_VERSION, slots };
  await fs.promises.writeFile(storePath(), JSON.stringify(body, null, 2), 'utf-8');
}
