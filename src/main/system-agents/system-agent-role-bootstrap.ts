import * as fs from 'fs';
import * as path from 'path';
import type { SubAgentRoleTemplateId } from '../../shared/sub-agent-types';
import { systemSubagentRolesDirAbs } from './system-agent-layout';

import templateSkillsAgents from '../../workspace-templates/subagent-roles/skills/AGENTS.md';
import templateSkillsSoul from '../../workspace-templates/subagent-roles/skills/SOUL.md';
import templateSkillsTools from '../../workspace-templates/subagent-roles/skills/TOOLS.md';

import templateCogAgents from '../../workspace-templates/subagent-roles/cognitive-allocation/AGENTS.md';
import templateCogSoul from '../../workspace-templates/subagent-roles/cognitive-allocation/SOUL.md';
import templateCogTools from '../../workspace-templates/subagent-roles/cognitive-allocation/TOOLS.md';
import templateCogClassifier from '../../workspace-templates/subagent-roles/cognitive-allocation/CLASSIFIER.md';

type RoleMd = 'AGENTS.md' | 'SOUL.md' | 'TOOLS.md';
type CognitiveRoleMd = RoleMd | 'CLASSIFIER.md';

const SYSTEM_ROLE_TEMPLATES: Record<
  'skills' | 'cognitive-allocation',
  Array<{ name: RoleMd | 'CLASSIFIER.md'; content: string }>
> = {
  skills: [
    { name: 'AGENTS.md', content: templateSkillsAgents },
    { name: 'SOUL.md', content: templateSkillsSoul },
    { name: 'TOOLS.md', content: templateSkillsTools },
  ],
  'cognitive-allocation': [
    { name: 'AGENTS.md', content: templateCogAgents },
    { name: 'SOUL.md', content: templateCogSoul },
    { name: 'TOOLS.md', content: templateCogTools },
    { name: 'CLASSIFIER.md', content: templateCogClassifier },
  ],
};

const COGNITIVE_ALLOCATION_ROLE_FILES: CognitiveRoleMd[] = ['AGENTS.md', 'SOUL.md', 'TOOLS.md', 'CLASSIFIER.md'];

async function writeFileIfMissing(abs: string, body: string): Promise<boolean> {
  try {
    await fs.promises.access(abs);
    return false;
  } catch {
    await fs.promises.mkdir(path.dirname(abs), { recursive: true });
    await fs.promises.writeFile(abs, body, 'utf-8');
    return true;
  }
}

export async function ensureSystemSubAgentRoleTemplates(): Promise<void> {
  const baseDir = systemSubagentRolesDirAbs();
  await fs.promises.mkdir(baseDir, { recursive: true });
  for (const [roleId, files] of Object.entries(SYSTEM_ROLE_TEMPLATES)) {
    const dir = path.join(baseDir, roleId);
    for (const f of files) {
      await writeFileIfMissing(path.join(dir, f.name), String(f.content ?? '').trimEnd() + '\n');
    }
  }
}

async function readRoleMarkdownParts(
  roleTemplateId: 'skills' | 'cognitive-allocation',
  fileNames: readonly CognitiveRoleMd[]
): Promise<string[]> {
  const baseDir = systemSubagentRolesDirAbs();
  const dir = path.join(baseDir, roleTemplateId);
  const parts: string[] = [];
  for (const name of fileNames) {
    try {
      const body = await fs.promises.readFile(path.join(dir, name), 'utf-8');
      parts.push(body.trimEnd());
    } catch {
      const fallback = SYSTEM_ROLE_TEMPLATES[roleTemplateId]?.find((x) => x.name === name)?.content;
      if (fallback) parts.push(String(fallback).trimEnd());
    }
  }
  return parts;
}

export async function buildSystemSubAgentRoleSystemContent(
  roleTemplateId: SubAgentRoleTemplateId
): Promise<string> {
  if (roleTemplateId === 'skills') {
    return (await readRoleMarkdownParts('skills', ['AGENTS.md', 'SOUL.md', 'TOOLS.md'])).join('\n\n');
  }
  if (roleTemplateId === 'cognitive-allocation') {
    return buildCognitiveAllocationSystemPrompt();
  }
  return '';
}

/** 认知分配 Agent 完整 system 提示（含 CLASSIFIER 方法论）。 */
export async function buildCognitiveAllocationSystemPrompt(): Promise<string> {
  return (await readRoleMarkdownParts('cognitive-allocation', COGNITIVE_ALLOCATION_ROLE_FILES)).join('\n\n');
}
