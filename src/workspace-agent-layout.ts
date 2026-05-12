/**
 * 工作区「Agent 配置」统一根目录：`.agent/` 下集中 **`.skills`**、**`.subagent-roles`**、主 Agent 角色、工具清单、以及片段笔记目录 **`.memory/`**（点目录）。
 * `.clawflow/` 仍保留会话与 workspace 元数据等；**`.subclawflow/`**（工作区根下）为各子 Agent 槽位工作缓存，与本目录分离。
 */

import * as fs from 'fs';
import * as path from 'path';

export const WORKSPACE_AGENT_DIR = '.agent';

/** 相对工作区根（POSIX 展示 / manifest 说明用） */
export const WORKSPACE_AGENT_TOOL_REL = '.agent/.tool';
export const WORKSPACE_ROLE_AGENT_DIR = '.agent/.roleAgent';
export const WORKSPACE_AGENT_SKILLS_REL = '.agent/.skills';
export const WORKSPACE_SUBAGENT_ROLE_DIR = '.agent/.subagent-roles';

/** 片段/当日笔记等落盘目录（点目录，位于 `.agent/` 下，与角色、技能并列） */
export const WORKSPACE_AGENT_DOT_MEMORY_REL = '.agent/.memory';

export function workspaceAgentRootAbs(workspaceRoot: string): string {
  return path.join(path.resolve(workspaceRoot), WORKSPACE_AGENT_DIR);
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
  return path.join(workspaceAgentRootAbs(workspaceRoot), '.subagent-roles');
}

export function workspaceAgentDotMemoryDirAbs(workspaceRoot: string): string {
  return path.join(workspaceAgentRootAbs(workspaceRoot), '.memory');
}

/** 将历史路径 `.clawflow/skills`、旧版 `.agent/skills` 规范为 `.agent/.skills`（模型或旧数据可能仍传旧前缀）。 */
export function normalizeHermesSkillWorkspaceRel(rel: string): string {
  const n = String(rel ?? '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\/+/, '');
  if (n === '.clawflow/skills' || n.startsWith('.clawflow/skills/')) {
    return `.agent/.skills${n.slice('.clawflow/skills'.length)}`;
  }
  if (n === '.agent/skills' || n.startsWith('.agent/skills/')) {
    return `.agent/.skills${n.slice('.agent/skills'.length)}`;
  }
  return n;
}

/**
 * 将旧版根目录 `.tool` / `.roleAgent` 及 `.clawflow/{skills,subagent-roles}` 迁入 `.agent/`，
 * 并将旧版无点目录 `skills` / `subagent-roles` 迁为 **`.skills`** / **`.subagent-roles`**；仅当目标尚不存在时执行。
 */
export function migrateLegacyWorkspaceAgentBundleSync(workspaceRoot: string): void {
  const root = path.resolve(workspaceRoot);
  const agent = workspaceAgentRootAbs(root);
  try {
    fs.mkdirSync(agent, { recursive: true });
  } catch (e) {
    console.warn('[workspace-agent-layout] mkdir .agent failed:', e);
    return;
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
  tryMove(path.join(agent, 'skills'), path.join(agent, '.skills'));
  tryMove(path.join(agent, 'subagent-roles'), path.join(agent, '.subagent-roles'));
}
