/**
 * Hermes：技能文件变更后触发 FTS 增量同步（S8）。
 */

import { syncSkillTextSourcesToMemoryDb } from './hermes-memory-db';

export function isWorkspaceRelativeUnderHermesSkillTree(rel: string): boolean {
  const n = String(rel ?? '')
    .replace(/\\/g, '/')
    .replace(/^\/+/, '');
  return (
    n === '.agent/.skills' ||
    n.startsWith('.agent/.skills/') ||
    n === '.agent/skills' ||
    n.startsWith('.agent/skills/') ||
    n === '.agent/.clawflow/skills' ||
    n.startsWith('.agent/.clawflow/skills/') ||
    n === '.clawflow/skills' ||
    n.startsWith('.clawflow/skills/')
  );
}

export type PatchPathsSummary = { added: string[]; modified: string[]; deleted: string[] };

function normRel(p: string): string {
  return String(p ?? '')
    .replace(/\\/g, '/')
    .replace(/^\/+/, '');
}

export function patchSummaryTouchesHermesSkillTree(summary: PatchPathsSummary): boolean {
  for (const p of summary.added) {
    if (isWorkspaceRelativeUnderHermesSkillTree(normRel(p))) return true;
  }
  for (const p of summary.modified) {
    if (isWorkspaceRelativeUnderHermesSkillTree(normRel(p))) return true;
  }
  for (const p of summary.deleted) {
    if (isWorkspaceRelativeUnderHermesSkillTree(normRel(p))) return true;
  }
  return false;
}

/** 技能树内文件变更后调用：增量更新 memory_docs + FTS（失败仅打日志） */
export function refreshHermesSkillMemoryIndexBestEffort(workspaceRoot: string): void {
  try {
    const r = syncSkillTextSourcesToMemoryDb(workspaceRoot, { fullRebuild: false });
    if (!r.ok) {
      console.warn('[hermes] skill FTS incremental sync failed:', r.error);
    }
  } catch (e) {
    console.warn('[hermes] skill FTS incremental sync error:', e);
  }
}
