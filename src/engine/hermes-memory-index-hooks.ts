/**
 * Hermes：工作区文本（技能 + Hermes notes）变更后触发 FTS 增量同步。
 */

import { refreshHermesMemoryIndex } from './hermes-memory-service';
import { isHermesMemoryRel } from './hermes-memory-store';

export function isWorkspaceRelativeUnderHermesSkillTree(rel: string): boolean {
  const n = String(rel ?? '')
    .replace(/\\/g, '/')
    .replace(/^\/+/, '');
  return n === '.agent/.skills' || n.startsWith('.agent/.skills/');
}

export function isWorkspaceRelativeUnderMainMemoryTree(rel: string): boolean {
  return isHermesMemoryRel(rel);
}

export function isWorkspaceRelativeUnderKnowledgeTree(rel: string): boolean {
  const n = String(rel ?? '')
    .replace(/\\/g, '/')
    .replace(/^\/+/, '');
  return n === '.agent/.knowledge' || n.startsWith('.agent/.knowledge/');
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

/** Hermes notes / 技能等 Markdown 变更后：增量更新 memory_docs + FTS */
export function refreshHermesMemoryIndexBestEffort(workspaceRoot: string): void {
  refreshHermesMemoryIndex(workspaceRoot);
}
