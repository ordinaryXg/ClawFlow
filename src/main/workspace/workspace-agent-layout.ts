/**
 * 工作区布局（主进程约定，POSIX 风格相对路径；**物理根**在工作区目录下）：
 * - **`.agent/`**：主 Agent 角色、技能、**`.hermes/index`**（记忆索引）、**`.evolution/`**（进化元数据）、**`.clawflow/`**（会话等）。
 * 系统级子 Agent 在应用缓存，**不**使用工作区 `.subagent/`。
 * 仅 **`.clawflow-launcher-stash/`** 留在应用缓存 `workspaces/<hash>/`（见 `workspace-blob-store`）。
 */

import * as fs from 'fs';
import * as path from 'path';
import { migrateHermesLayoutSync, HERMES_MEMORY_REL_PREFIX } from './workspace-hermes-layout';

export const WORKSPACE_AGENT_DIR = '.agent';

/** 相对工作区根（POSIX 展示 / manifest 说明用） */
export const WORKSPACE_AGENT_TOOL_REL = '.agent/.tool';
export const WORKSPACE_ROLE_AGENT_DIR = '.agent/.roleAgent';
export const WORKSPACE_AGENT_SKILLS_REL = '.agent/.skills';

/** Hermes 记忆逻辑路径前缀（仅存于索引，无 notes 目录） */
export const WORKSPACE_AGENT_DOT_MEMORY_REL = HERMES_MEMORY_REL_PREFIX;

/** 用户知识库文档（可检索；与 Hermes notes 分工：notes=进化/会话提炼，knowledge=用户策展） */
export const WORKSPACE_AGENT_KNOWLEDGE_REL = '.agent/.knowledge';

/** @deprecated 旧版目录名（无点前缀） */
export const WORKSPACE_AGENT_KNOWLEDGE_LEGACY_REL = '.agent/knowledge';

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

/** @deprecated 记忆无磁盘目录 */
export function workspaceAgentDotMemoryDirAbs(workspaceRoot: string): string {
  return path.join(workspaceAgentRootAbs(workspaceRoot), '.hermes');
}

export function workspaceAgentKnowledgeDirAbs(workspaceRoot: string): string {
  return path.join(workspaceAgentRootAbs(workspaceRoot), '.knowledge');
}

/** 将历史路径 `.agent/knowledge/...` 规范为 `.agent/.knowledge/...`。 */
export function normalizeHermesKnowledgeWorkspaceRel(rel: string): string {
  const n = String(rel ?? '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\/+/, '');
  if (n === WORKSPACE_AGENT_KNOWLEDGE_LEGACY_REL || n.startsWith(`${WORKSPACE_AGENT_KNOWLEDGE_LEGACY_REL}/`)) {
    return `${WORKSPACE_AGENT_KNOWLEDGE_REL}${n.slice(WORKSPACE_AGENT_KNOWLEDGE_LEGACY_REL.length)}`;
  }
  return n;
}

/** 将历史路径 `.clawflow/skills`、`.agent/.clawflow/skills`、旧版 `.agent/skills` 规范为 `.agent/.skills`。 */
export function normalizeHermesSkillWorkspaceRel(rel: string): string {
  const n = String(rel ?? '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\/+/, '');
  if (n === '.clawflow/skills' || n.startsWith('.clawflow/skills/')) {
    return `.agent/.skills${n.slice('.clawflow/skills'.length)}`;
  }
  if (n === '.agent/.clawflow/skills' || n.startsWith('.agent/.clawflow/skills/')) {
    return `.agent/.skills${n.slice('.agent/.clawflow/skills'.length)}`;
  }
  if (n === '.agent/skills' || n.startsWith('.agent/skills/')) {
    return `.agent/.skills${n.slice('.agent/skills'.length)}`;
  }
  return n;
}

/**
 * 将历史布局迁入当前约定（`.clawflow` → `.agent/.clawflow` 等）；**不再**创建或迁入工作区 `.subagent/`。
 */
export function migrateLegacyWorkspaceAgentBundleSync(workspaceRoot: string): void {
  const root = path.resolve(workspaceRoot);
  const agent = workspaceAgentRootAbs(root);
  try {
    fs.mkdirSync(agent, { recursive: true });
  } catch (e) {
    console.warn('[workspace-agent-layout] mkdir .agent failed:', e);
  }

  const tryMove = (from: string, to: string) => {
    try {
      if (!fs.existsSync(from)) return;
      if (fs.existsSync(to)) return;
      fs.renameSync(from, to);
    } catch (e) {
      console.warn('[workspace-agent-layout] migrate rename failed:', from, '->', to, e);
    }
  };

  tryMove(path.join(root, '.tool'), path.join(agent, '.tool'));
  tryMove(path.join(root, '.roleAgent'), path.join(agent, '.roleAgent'));
  tryMove(path.join(root, '.clawflow', 'skills'), path.join(agent, '.skills'));
  tryMove(path.join(root, '.clawflow'), path.join(agent, '.clawflow'));
  tryMove(path.join(agent, '.clawflow', 'skills'), path.join(agent, '.skills'));
  tryMove(path.join(agent, 'skills'), path.join(agent, '.skills'));

  migrateAgentManifestAndKnowledgePathsSync(workspaceRoot);
}

/**
 * 路径约定迁移（每次打开工作区可安全调用；目标已存在则跳过）。
 */
export function migrateAgentManifestAndKnowledgePathsSync(workspaceRoot: string): void {
  const root = path.resolve(workspaceRoot);
  const agent = workspaceAgentRootAbs(root);
  const tryMove = (from: string, to: string) => {
    try {
      if (!fs.existsSync(from)) return;
      if (fs.existsSync(to)) return;
      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.renameSync(from, to);
    } catch (e) {
      console.warn('[workspace-agent-layout] migrate path failed:', from, '->', to, e);
    }
  };

  tryMove(path.join(agent, 'knowledge'), path.join(agent, '.knowledge'));
  tryMove(path.join(agent, '.clawflow', 'knowledge-manifest.json'), path.join(agent, '.knowledge', 'knowledge-manifest.json'));
  tryMove(path.join(agent, '.tool', 'skillManifest.json'), path.join(agent, '.skills', 'skillManifest.json'));

  migrateHermesLayoutSync(workspaceRoot);
}
