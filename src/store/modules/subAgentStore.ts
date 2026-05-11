import { create } from 'zustand';
import type { SubAgentSlot } from '../../shared/sub-agent-types';

function coerceSlots(raw: unknown): SubAgentSlot[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((x) => {
    if (!x || typeof x !== 'object') return false;
    const o = x as Record<string, unknown>;
    if (typeof o.id !== 'string' || typeof o.label !== 'string' || typeof o.behavior !== 'string') return false;
    const st = o.status;
    return st === 'stopped' || st === 'starting' || st === 'running' || st === 'error';
  }) as SubAgentSlot[];
}

interface SubAgentState {
  slots: SubAgentSlot[];
  load: () => Promise<void>;
}

export const useSubAgentStore = create<SubAgentState>((set) => ({
  slots: [],
  load: async () => {
    try {
      const res = await window.electronAPI?.subAgentsList?.();
      set({ slots: coerceSlots(res?.slots) });
    } catch {
      set({ slots: [] });
    }
  },
}));
