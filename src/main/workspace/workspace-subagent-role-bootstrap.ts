/**
 * 子 Agent 角色模板：写入工作区 `.subagent/.subroleAgent/`，仅在缺失时创建（不覆盖用户修改）。
 *
 * 这些模板与主 Agent `.agent/.roleAgent/` 无关；子 Agent 运行时会按 slot.roleTemplateId 读取。
 */

import * as fs from 'fs';
import * as path from 'path';
import templateProgramAgents from '../../workspace-templates/subagent-roles/program/AGENTS.md';
import templateProgramSoul from '../../workspace-templates/subagent-roles/program/SOUL.md';
import templateProgramTools from '../../workspace-templates/subagent-roles/program/TOOLS.md';

import templateCreativeAgents from '../../workspace-templates/subagent-roles/creative/AGENTS.md';
import templateCreativeSoul from '../../workspace-templates/subagent-roles/creative/SOUL.md';
import templateCreativeTools from '../../workspace-templates/subagent-roles/creative/TOOLS.md';

import templateDataAgents from '../../workspace-templates/subagent-roles/data/AGENTS.md';
import templateDataSoul from '../../workspace-templates/subagent-roles/data/SOUL.md';
import templateDataTools from '../../workspace-templates/subagent-roles/data/TOOLS.md';

import templateAssistantAgents from '../../workspace-templates/subagent-roles/assistant/AGENTS.md';
import templateAssistantSoul from '../../workspace-templates/subagent-roles/assistant/SOUL.md';
import templateAssistantTools from '../../workspace-templates/subagent-roles/assistant/TOOLS.md';

import type { SubAgentRoleTemplateId } from '../../shared/sub-agent-types';
import { WORKSPACE_SUBAGENT_ROLE_DIR, workspaceSubagentRolesDirAbs } from './workspace-agent-layout';

type SubagentRoleMd = 'AGENTS.md' | 'SOUL.md' | 'TOOLS.md';

const TEMPLATE_SETS: Record<
  'program' | 'creative' | 'data' | 'assistant',
  Array<{ name: SubagentRoleMd; content: string }>
> = {
  program: [
    { name: 'AGENTS.md', content: templateProgramAgents },
    { name: 'SOUL.md', content: templateProgramSoul },
    { name: 'TOOLS.md', content: templateProgramTools },
  ],
  creative: [
    { name: 'AGENTS.md', content: templateCreativeAgents },
    { name: 'SOUL.md', content: templateCreativeSoul },
    { name: 'TOOLS.md', content: templateCreativeTools },
  ],
  data: [
    { name: 'AGENTS.md', content: templateDataAgents },
    { name: 'SOUL.md', content: templateDataSoul },
    { name: 'TOOLS.md', content: templateDataTools },
  ],
  assistant: [
    { name: 'AGENTS.md', content: templateAssistantAgents },
    { name: 'SOUL.md', content: templateAssistantSoul },
    { name: 'TOOLS.md', content: templateAssistantTools },
  ],
};

/** 工作区仅托管 4 个可委派槽位角色；Skill Agent 模板在系统缓存 `system/.subagent/.subroleAgent/skills/` */
const WORKSPACE_ROLE_TEMPLATE_IDS = Object.keys(TEMPLATE_SETS) as Array<keyof typeof TEMPLATE_SETS>;

async function writeFileIfMissing(filePath: string, content: string): Promise<boolean> {
  try {
    await fs.promises.writeFile(filePath, content, { encoding: 'utf-8', flag: 'wx' });
    return true;
  } catch (e: any) {
    if (e?.code === 'EEXIST') return false;
    throw e;
  }
}

export async function ensureWorkspaceSubAgentRoleTemplates(workspaceRoot: string): Promise<{ created: string[] }> {
  const root = path.resolve(workspaceRoot);
  const { pruneSystemSubagentArtifactsFromWorkspace } = await import('../sub-agent/workspace-subagent-artifacts');
  await pruneSystemSubagentArtifactsFromWorkspace(root);
  const roleDir = workspaceSubagentRolesDirAbs(root);
  await fs.promises.mkdir(roleDir, { recursive: true });

  const created: string[] = [];
  for (const id of WORKSPACE_ROLE_TEMPLATE_IDS) {
    const files = TEMPLATE_SETS[id];
    if (!files) continue;
    const dir = path.join(roleDir, id);
    await fs.promises.mkdir(dir, { recursive: true });
    for (const f of files) {
      const filePath = path.join(dir, f.name);
      const body = f.content.endsWith('\n') ? f.content : `${f.content}\n`;
      if (await writeFileIfMissing(filePath, body)) {
        created.push(path.join(WORKSPACE_SUBAGENT_ROLE_DIR, id, f.name).replace(/\\/g, '/'));
      }
    }
  }

  return { created };
}
