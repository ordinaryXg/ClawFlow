/**
 * Hermes：工作区文本（技能 + 主记忆）变更后触发 FTS 增量同步。
 */

import { syncHermesTextSourcesToMemoryDb } from './hermes-memory-db';

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

export function isWorkspaceRelativeUnderMainMemoryTree(rel: string): boolean {
  const n = String(rel ?? '')
    .replace(/\\/g, '/')
    .replace(/^\/+/, '');
  return n === '.agent/.memory' || n.startsWith('.agent/.memory/');
}

export function isWorkspaceRelativeUnderKnowledgeTree(rel: string): boolean {
  const n = String(rel ?? '')
    .replace(/\\/g, '/')
    .replace(/^\/+/, '');
  return n === '.agent/knowledge' || n.startsWith('.agent/knowledge/');
}

export function isWorkspaceRelativeUnderKnowledgeIngestTree(rel: string): boolean {
  const n = String(rel ?? '')
    .replace(/\\/g, '/')
    .replace(/^\/+/, '');
  return (
    n === '.agent/.clawflow/knowledge-ingest' || n.startsWith('.agent/.clawflow/knowledge-ingest/')
  );
}

export function isWorkspaceRelativeUnderHermesIndexedTextTree(rel: string): boolean {
  return (
    isWorkspaceRelativeUnderHermesSkillTree(rel) ||
    isWorkspaceRelativeUnderMainMemoryTree(rel) ||
    isWorkspaceRelativeUnderKnowledgeTree(rel) ||
    isWorkspaceRelativeUnderKnowledgeIngestTree(rel)
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

export function patchSummaryTouchesHermesIndexedText(summary: PatchPathsSummary): boolean {
  for (const p of summary.added) {
    if (isWorkspaceRelativeUnderHermesIndexedTextTree(normRel(p))) return true;
  }
  for (const p of summary.modified) {
    if (isWorkspaceRelativeUnderHermesIndexedTextTree(normRel(p))) return true;
  }
  for (const p of summary.deleted) {
    if (isWorkspaceRelativeUnderHermesIndexedTextTree(normRel(p))) return true;
  }
  return false;
}

/** @deprecated 使用 refreshHermesMemoryIndexBestEffort */
export function patchSummaryTouchesHermesSkillTreeOnly(summary: PatchPathsSummary): boolean {
  return patchSummaryTouchesHermesSkillTree(summary);
}

/** 技能或 `.agent/.memory` 内 Markdown 变更后：增量更新 memory_docs + FTS */
export function refreshHermesMemoryIndexBestEffort(workspaceRoot: string): void {
  try {
    const r = syncHermesTextSourcesToMemoryDb(workspaceRoot, { fullRebuild: false });
    if (!r.ok) {
      console.warn('[hermes] FTS incremental sync failed:', r.error);
    }
  } catch (e) {
    console.warn('[hermes] FTS incremental sync error:', e);
  }
}

/** @deprecated 别名：现同步技能 + 主记忆 */
export function refreshHermesSkillMemoryIndexBestEffort(workspaceRoot: string): void {
  refreshHermesMemoryIndexBestEffort(workspaceRoot);
}
