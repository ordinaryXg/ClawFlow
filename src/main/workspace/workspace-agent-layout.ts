/**
 * 工作区布局（主进程约定，POSIX 风格相对路径；**物理根**在工作区目录下）：
 * - **`.agent/`**：主 Agent 角色、工具清单、技能、`.memory/`、以及主会话元数据 **`.agent/.clawflow/`**（会话 JSON、待办、爬取、Hermes DB 等）。
 * - **`.subagent/`**：子 Agent 专用区——**`.subclawflow/`**、**`.submemory/`**、**`.subroleAgent/`**，与主 `.agent/.memory/` 分离。
 * 仅 **`.clawflow-launcher-stash/`** 留在应用缓存 `workspaces/<hash>/`（见 `workspace-blob-store`），不随 Git 工作区迁移。
 */

import * as fs from 'fs';
import * as path from 'path';

export const WORKSPACE_AGENT_DIR = '.agent';

/** 相对工作区根（POSIX 展示 / manifest 说明用） */
export const WORKSPACE_AGENT_TOOL_REL = '.agent/.tool';
export const WORKSPACE_ROLE_AGENT_DIR = '.agent/.roleAgent';
export const WORKSPACE_AGENT_SKILLS_REL = '.agent/.skills';
/** 子 Agent 角色模板根（在 `.subagent/` 下，与主 `.agent/` 分离） */
export const WORKSPACE_SUBAGENT_ROLE_DIR = '.subagent/.subroleAgent';

/** 片段/当日笔记等落盘目录（点目录，位于 `.agent/` 下，与角色、技能并列） */
export const WORKSPACE_AGENT_DOT_MEMORY_REL = '.agent/.memory';

/** 用户知识库文档（可检索；与 `.memory` 分工：memory=进化/会话提炼，knowledge=用户策展文档） */
export const WORKSPACE_AGENT_KNOWLEDGE_REL = '.agent/.knowledge';

/** @deprecated 旧版目录名（无点前缀） */
export const WORKSPACE_AGENT_KNOWLEDGE_LEGACY_REL = '.agent/knowledge';

function resolvedWorkspaceRoot(workspaceRoot: string): string {
  return path.resolve(String(workspaceRoot ?? '').trim());
}

export function workspaceAgentRootAbs(workspaceRoot: string): string {
  return path.join(resolvedWorkspaceRoot(workspaceRoot), WORKSPACE_AGENT_DIR);
}

export function workspaceSubagentRootAbs(workspaceRoot: string): string {
  return path.join(resolvedWorkspaceRoot(workspaceRoot), '.subagent');
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

export function workspaceSubagentRolesDirAbs(workspaceRoot: string): string {
  return path.join(workspaceSubagentRootAbs(workspaceRoot), '.subroleAgent');
}

export function workspaceAgentDotMemoryDirAbs(workspaceRoot: string): string {
  return path.join(workspaceAgentRootAbs(workspaceRoot), '.memory');
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

/** 将历史路径 `.clawflow/skills`、`.agent/.clawflow/skills`、旧版 `.agent/skills` 规范为 `.agent/.skills`（模型或旧数据可能仍传旧前缀）。 */
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
 * 将历史布局迁入当前约定：
 * - 根目录 `.clawflow/` → `.agent/.clawflow/`
 * - 根目录 `.subclawflow/`、`.submemory/` → `.subagent/.subclawflow/`、`.subagent/.submemory/`
 * - `.agent/.subagent-roles/` → `.subagent/.subroleAgent/`
 * - 以及旧版 `.tool` / `.roleAgent`、无点 `skills` 等；仅当目标尚不存在时 `rename`。
 */
export function migrateLegacyWorkspaceAgentBundleSync(workspaceRoot: string): void {
  const root = path.resolve(workspaceRoot);
  const agent = workspaceAgentRootAbs(root);
  const subagent = workspaceSubagentRootAbs(root);
  try {
    fs.mkdirSync(agent, { recursive: true });
  } catch (e) {
    console.warn('[workspace-agent-layout] mkdir .agent failed:', e);
  }
  try {
    fs.mkdirSync(subagent, { recursive: true });
  } catch (e) {
    console.warn('[workspace-agent-layout] mkdir .subagent failed:', e);
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
  tryMove(path.join(root, '.clawflow', 'subagent-roles'), path.join(agent, '.subagent-roles'));

  tryMove(path.join(root, '.clawflow'), path.join(agent, '.clawflow'));

  tryMove(path.join(agent, '.clawflow', 'skills'), path.join(agent, '.skills'));

  tryMove(path.join(agent, 'skills'), path.join(agent, '.skills'));
  tryMove(path.join(agent, 'subagent-roles'), path.join(agent, '.subagent-roles'));

  try {
    fs.mkdirSync(subagent, { recursive: true });
  } catch {
    /* 目标在 .subagent 下，rename 前确保父目录存在 */
  }

  tryMove(path.join(agent, '.subagent-roles'), path.join(subagent, '.subroleAgent'));

  tryMove(path.join(root, '.subclawflow'), path.join(subagent, '.subclawflow'));
  tryMove(path.join(root, '.submemory'), path.join(subagent, '.submemory'));

  migrateAgentManifestAndKnowledgePathsSync(workspaceRoot);
}

/**
 * 路径约定迁移（每次打开工作区可安全调用；目标已存在则跳过）。
 * - `knowledge/` → `.knowledge/`
 * - `.clawflow/knowledge-manifest.json` → `.knowledge/knowledge-manifest.json`
 * - `.tool/skillManifest.json` → `.skills/skillManifest.json`
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
}
