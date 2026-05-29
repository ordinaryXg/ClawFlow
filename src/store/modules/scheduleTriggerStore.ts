import { create } from 'zustand';
import type { ScheduleTriggerRecord } from '../../shared/schedule-triggers';

function coerceTriggers(raw: unknown): ScheduleTriggerRecord[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((x) => x && typeof x === 'object' && typeof (x as { id?: string }).id === 'string') as ScheduleTriggerRecord[];
}

type State = {
  triggers: ScheduleTriggerRecord[];
  setTriggers: (list: ScheduleTriggerRecord[]) => void;
  load: () => Promise<void>;
};

export const useScheduleTriggerStore = create<State>((set) => ({
  triggers: [],
  setTriggers: (triggers) => set({ triggers }),
  load: async () => {
    try {
      const res = await window.electronAPI?.scheduleTriggersList?.();
      set({ triggers: coerceTriggers(res?.triggers) });
    } catch {
      set({ triggers: [] });
    }
  },
}));
