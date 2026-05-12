import { create } from 'zustand';
import type { SubAgentRunSnapshot, SubAgentSlot } from '../../shared/sub-agent-types';

function coerceSlots(raw: unknown): SubAgentSlot[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((x) => {
    if (!x || typeof x !== 'object') return false;
    const o = x as Record<string, unknown>;
    if (typeof o.id !== 'string' || typeof o.label !== 'string' || typeof o.behavior !== 'string') return false;
    const st = o.status;
    if (!(st === 'stopped' || st === 'starting' || st === 'running' || st === 'error')) return false;
    const r = o.roleTemplateId;
    if (
      r !== undefined &&
      r !== 'program' &&
      r !== 'creative' &&
      r !== 'data' &&
      r !== 'assistant' &&
      r !== 'skills'
    )
      return false;
    const d = o.delegatable;
    if (d !== undefined && d !== true && d !== false) return false;
    const ste = o.skillToolsEnabled;
    if (ste !== undefined && ste !== true && ste !== false) return false;
    return true;
  }) as SubAgentSlot[];
}

function coerceRunSnapshots(raw: unknown): Record<string, SubAgentRunSnapshot> {
  if (!raw || typeof raw !== 'object') return {};
  const out: Record<string, SubAgentRunSnapshot> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!v || typeof v !== 'object') continue;
    const o = v as Record<string, unknown>;
    const st = o.status;
    if (st !== 'idle' && st !== 'running' && st !== 'completed' && st !== 'error' && st !== 'interrupted') continue;
    out[k] = {
      status: st,
      taskText: String(o.taskText ?? ''),
      conversationId: String(o.conversationId ?? ''),
      logTail: String(o.logTail ?? ''),
      updatedAt: typeof o.updatedAt === 'number' ? o.updatedAt : 0,
    };
  }
  return out;
}

interface SubAgentState {
  slots: SubAgentSlot[];
  runSnapshots: Record<string, SubAgentRunSnapshot>;
  load: () => Promise<void>;
}

export const useSubAgentStore = create<SubAgentState>((set) => ({
  slots: [],
  runSnapshots: {},
  load: async () => {
    try {
      const res = await window.electronAPI?.subAgentsList?.();
      set({
        slots: coerceSlots(res?.slots),
        runSnapshots: coerceRunSnapshots((res as { runSnapshots?: unknown })?.runSnapshots),
      });
    } catch {
      set({ slots: [], runSnapshots: {} });
    }
  },
}));
