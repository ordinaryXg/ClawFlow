/**
 * 技能市场类型（主进程 / 渲染进程共用，无 Node 依赖）。
 */

export interface SkillMarketEntry {
  id: string;
  name: string;
  title?: string;
  description: string;
  version: string;
  /** 传给 `openclaw skills install` 的包名/标识 */
  package: string;
}

export interface SkillMarketIndexFile {
  version: number;
  updatedAt?: string;
  skills: SkillMarketEntry[];
}

export type SkillMarketSource = 'remote' | 'bundled' | 'remote+cached';

export type SkillMarketFetchResult =
  | { ok: true; index: SkillMarketIndexFile; source: SkillMarketSource; warning?: string }
  | { ok: false; error: string; index?: SkillMarketIndexFile; source?: SkillMarketSource };
