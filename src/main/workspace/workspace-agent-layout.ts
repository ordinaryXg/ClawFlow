/**
 * 工作区布局（主进程约定，POSIX 风格相对路径；**物理根**在工作区目录下）：
 * - **`.agent/`**：主 Agent 角色、技能、**`.hermes/index`**（记忆索引）、**`.evolution/`**（进化元数据）、**`.clawflow/`**（会话等）。
 * 系统级子 Agent 在应用缓存，**不**使用工作区 `.subagent/`。
 * 仅 **`.clawflow-launcher-stash/`** 留在应用缓存 `workspaces/<hash>/`（见 `workspace-blob-store`）。
 */

import * as fs from 'fs';
import * as path from 'path';
import { ensureEvolutionLayoutSync } from './workspace-evolution-layout';
import { ensureHermesLayoutSync, HERMES_MEMORY_REL_PREFIX } from './workspace-hermes-layout';

export const WORKSPACE_AGENT_DIR = '.agent';

/** 相对工作区根（POSIX 展示 / manifest 说明用） */
export const WORKSPACE_AGENT_TOOL_REL = '.agent/.tool';
export const WORKSPACE_ROLE_AGENT_DIR = '.agent/.roleAgent';
export const WORKSPACE_AGENT_SKILLS_REL = '.agent/.skills';

/** Hermes 记忆逻辑路径前缀（仅存于索引，无 notes 目录） */
export const WORKSPACE_AGENT_DOT_MEMORY_REL = HERMES_MEMORY_REL_PREFIX;

/** 用户知识库文档（可检索；与 Hermes notes 分工：notes=进化/会话提炼，knowledge=用户策展） */
export const WORKSPACE_AGENT_KNOWLEDGE_REL = '.agent/.knowledge';

function resolvedWorkspaceRoot(workspaceRoot: string): string {
  return path.resolve(String(workspaceRoot ?? '').trim());
}

export function workspaceAgentRootAbs(workspaceRoot: string): string {
  return path.join(resolvedWorkspaceRoot(workspaceRoot), WORKSPACE_AGENT_DIR);
}

export function workspaceToolDirAbs(workspaceRoot: string): string {
  return path.join(workspaceAgentRootAbs(workspaceRoot), '.tool');
}

export function workspaceRoleAgentDirAbs(workspaceRoot: string): string {
  return path.join(workspaceAgentRootAbs(workspaceRoot), '.roleAgent');
}

export function workspaceSkillsDirAbs(workspaceRoot: string): string {
  return path.join(workspaceAgentRootAbs(workspaceRoot), '.skills');
}

export function workspaceAgentKnowledgeDirAbs(workspaceRoot: string): string {
  return path.join(workspaceAgentRootAbs(workspaceRoot), '.knowledge');
}

export function normalizeWorkspaceRel(rel: string): string {
  return String(rel ?? '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\/+/, '');
}

/** 规范为 POSIX 相对路径（技能树仅认 `.agent/.skills`）。 */
export function normalizeHermesSkillWorkspaceRel(rel: string): string {
  return normalizeWorkspaceRel(rel);
}

/** 确保工作区 `.agent` 及 Hermes / 进化目录存在。 */
export function ensureWorkspaceAgentLayoutSync(workspaceRoot: string): void {
  const root = path.resolve(workspaceRoot);
  try {
    fs.mkdirSync(workspaceAgentRootAbs(root), { recursive: true });
  } catch (e) {
    console.warn('[workspace-agent-layout] mkdir .agent failed:', e);
  }
  ensureHermesLayoutSync(root);
  ensureEvolutionLayoutSync(root);
}
