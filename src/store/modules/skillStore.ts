// store/modules/skillStore.ts
// 技能状态管理

import { create } from 'zustand';
import type { SkillMarketEntry, SkillMarketFetchResult, SkillMarketSource } from '../../skill-market-shared';

export interface Skill {
  name: string;
  description: string;
  version: string;
  installed: boolean;
  enabled: boolean;
}

type SkillAPIResponse =
  | { skills?: Skill[]; installedSkills?: string[]; enabledSkills?: string[] }
  | Skill[]
  | null
  | undefined;

export interface SkillState {
  skills: Skill[];
  installedSkills: string[];
  enabledSkills: string[];
  isLoading: boolean;
  error: string | null;
  marketEntries: SkillMarketEntry[];
  marketSource: SkillMarketSource | null;
  marketWarning: string | null;
  marketLoading: boolean;
  marketError: string | null;

  // Actions
  fetchSkills: () => Promise<void>;
  fetchSkillMarket: (opts?: { forceRefresh?: boolean }) => Promise<SkillMarketFetchResult | null>;
  installSkill: (skillName: string) => Promise<void>;
  uninstallSkill: (skillName: string) => Promise<void>;
  enableSkill: (skillName: string) => Promise<void>;
  disableSkill: (skillName: string) => Promise<void>;
  setError: (error: string | null) => void;
}

export const useSkillStore = create<SkillState>((set) => ({
  skills: [],
  installedSkills: [],
  enabledSkills: [],
  isLoading: false,
  error: null,
  marketEntries: [],
  marketSource: null,
  marketWarning: null,
  marketLoading: false,
  marketError: null,

  fetchSkills: async () => {
    set({ isLoading: true, error: null });
    try {
      const res: SkillAPIResponse = await window.electronAPI?.getSkills?.();

      const fromRes = Array.isArray(res) ? res : Array.isArray(res?.skills) ? res?.skills : null;

      const nextSkills: Skill[] = Array.isArray(fromRes) ? fromRes : [];

      const installed = nextSkills.filter((skill) => skill.installed).map((skill) => skill.name);
      const enabled = nextSkills.filter((skill) => skill.enabled).map((skill) => skill.name);

      set({
        skills: nextSkills,
        installedSkills: installed,
        enabledSkills: enabled,
        isLoading: false,
      });
    } catch (error: any) {
      set({
        error: error.message || '获取技能列表失败',
        isLoading: false,
      });
    }
  },

  fetchSkillMarket: async (opts) => {
    const api = window.electronAPI;
    if (!api?.skillMarketGetIndex) {
      set({ marketError: 'skillMarketGetIndex unavailable', marketLoading: false });
      return null;
    }
    set({ marketLoading: true, marketError: null });
    try {
      const res = await api.skillMarketGetIndex({ forceRefresh: Boolean(opts?.forceRefresh) });
      if (!res || typeof res !== 'object' || !('ok' in res)) {
        const err = '技能市场返回数据异常（请重启应用或更新到最新版本）';
        set({
          marketEntries: [],
          marketSource: null,
          marketWarning: null,
          marketError: err,
          marketLoading: false,
        });
        return { ok: false as const, error: err };
      }
      if (!res.ok) {
        set({
          marketEntries: [],
          marketSource: null,
          marketWarning: null,
          marketError: res.error || '技能市场索引不可用',
          marketLoading: false,
        });
        return res;
      }
      set({
        marketEntries: res.index.skills,
        marketSource: res.source,
        marketWarning: res.warning ?? null,
        marketError: null,
        marketLoading: false,
      });
      return res;
    } catch (e: any) {
      const msg = e?.message || '技能市场加载失败';
      set({ marketEntries: [], marketSource: null, marketWarning: null, marketError: msg, marketLoading: false });
      return { ok: false as const, error: msg };
    }
  },
    
  installSkill: async (skillName: string) => {
    set({ isLoading: true, error: null });
    try {
      await window.electronAPI?.installSkill?.(skillName);
      
      set(state => ({ 
        skills: state.skills.map(skill => 
          skill.name === skillName 
            ? { ...skill, installed: true }
            : skill
        ),
        installedSkills: [...state.installedSkills, skillName],
        isLoading: false 
      }));
    } catch (error: any) {
      set({ 
        error: error.message || '安装技能失败',
        isLoading: false 
      });
      throw error;
    }
  },
    
  uninstallSkill: async (skillName: string) => {
    set({ isLoading: true, error: null });
    try {
      await window.electronAPI?.uninstallSkill?.(skillName);
      
      set(state => ({ 
        skills: state.skills.map(skill => 
          skill.name === skillName 
            ? { ...skill, installed: false, enabled: false }
            : skill
        ),
        installedSkills: state.installedSkills.filter(name => name !== skillName),
        enabledSkills: state.enabledSkills.filter(name => name !== skillName),
        isLoading: false 
      }));
    } catch (error: any) {
      set({ 
        error: error.message || '卸载技能失败',
        isLoading: false 
      });
      throw error;
    }
  },
    
  enableSkill: async (skillName: string) => {
    set({ isLoading: true, error: null });
    try {
      await window.electronAPI?.enableSkill?.(skillName);
      
      set(state => ({ 
        skills: state.skills.map(skill => 
          skill.name === skillName 
            ? { ...skill, enabled: true }
            : skill
        ),
        enabledSkills: [...state.enabledSkills, skillName],
        isLoading: false 
      }));
    } catch (error: any) {
      set({ 
        error: error.message || '启用技能失败',
        isLoading: false 
      });
      throw error;
    }
  },
    
  disableSkill: async (skillName: string) => {
    set({ isLoading: true, error: null });
    try {
      await window.electronAPI?.disableSkill?.(skillName);
      
      set(state => ({ 
        skills: state.skills.map(skill => 
          skill.name === skillName 
            ? { ...skill, enabled: false }
            : skill
        ),
        enabledSkills: state.enabledSkills.filter(name => name !== skillName),
        isLoading: false 
      }));
    } catch (error: any) {
      set({ 
        error: error.message || '禁用技能失败',
        isLoading: false 
      });
      throw error;
    }
  },
    
  setError: (error: string | null) => {
    set({ error });
  },
}));

export default useSkillStore;
