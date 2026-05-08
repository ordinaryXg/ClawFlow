// store/modules/skillStore.ts
// 技能状态管理

import { create } from 'zustand';

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
  
  // Actions
  fetchSkills: () => Promise<void>;
  installSkill: (skillName: string) => Promise<void>;
  uninstallSkill: (skillName: string) => Promise<void>;
  enableSkill: (skillName: string) => Promise<void>;
  disableSkill: (skillName: string) => Promise<void>;
  setError: (error: string | null) => void;
}

export const useSkillStore = create<SkillState>((set, get) => ({
  skills: [],
  installedSkills: [],
  enabledSkills: [],
  isLoading: false,
  error: null,
    
  fetchSkills: async () => {
    set({ isLoading: true, error: null });
    try {
      const res: SkillAPIResponse = await window.electronAPI?.getSkills?.();

      const fromRes = Array.isArray(res) ? res : Array.isArray(res?.skills) ? res?.skills : null;
      
      // 主进程目前返回模拟空数组时，保留一份 mock 以保证界面可用
      const mockSkills: Skill[] = [
        {
          name: 'westock-data',
          description: 'A股个股详情查询工具',
          version: '1.0.0',
          installed: true,
          enabled: true,
        },
        {
          name: 'westock-tool',
          description: 'A股筛选策略工具',
          version: '1.0.0',
          installed: false,
          enabled: false,
        },
      ];
      
      // 若主进程明确返回数组（哪怕为空），就尊重它；仅在无返回/异常时才用 mock 兜底
      const nextSkills = fromRes ? fromRes : mockSkills;

      const installed = nextSkills
        .filter(skill => skill.installed)
        .map(skill => skill.name);
      const enabled = nextSkills
        .filter(skill => skill.enabled)
        .map(skill => skill.name);
      
      set({ 
        skills: nextSkills,
        installedSkills: installed,
        enabledSkills: enabled,
        isLoading: false 
      });
    } catch (error: any) {
      set({ 
        error: error.message || '获取技能列表失败',
        isLoading: false 
      });
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
