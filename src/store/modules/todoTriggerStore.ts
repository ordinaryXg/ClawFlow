import { create } from 'zustand';
import type { TodoTriggerRecord } from '../../shared/todo-triggers';

function coerceTriggers(raw: unknown): TodoTriggerRecord[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((x) => x && typeof x === 'object' && typeof (x as { id?: string }).id === 'string') as TodoTriggerRecord[];
}

type State = {
  triggers: TodoTriggerRecord[];
  setTriggers: (list: TodoTriggerRecord[]) => void;
  load: () => Promise<void>;
};

export const useTodoTriggerStore = create<State>((set) => ({
  triggers: [],
  setTriggers: (triggers) => set({ triggers }),
  load: async () => {
    try {
      const res = await window.electronAPI?.todoTriggersList?.();
      set({ triggers: coerceTriggers(res?.triggers) });
    } catch {
      set({ triggers: [] });
    }
  },
}));
