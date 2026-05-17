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

import templateExpAgents from '../../workspace-templates/subagent-roles/expectation-planning/AGENTS.md';
import templateExpSoul from '../../workspace-templates/subagent-roles/expectation-planning/SOUL.md';
import templateExpTools from '../../workspace-templates/subagent-roles/expectation-planning/TOOLS.md';

type RoleMd = 'AGENTS.md' | 'SOUL.md' | 'TOOLS.md';

export type SystemRoleTemplateId = 'skills' | 'cognitive-allocation' | 'expectation-planning';

const SYSTEM_ROLE_TEMPLATES: Record<SystemRoleTemplateId, Array<{ name: RoleMd; content: string }>> = {
  skills: [
    { name: 'AGENTS.md', content: templateSkillsAgents },
    { name: 'SOUL.md', content: templateSkillsSoul },
    { name: 'TOOLS.md', content: templateSkillsTools },
  ],
  'cognitive-allocation': [
    { name: 'AGENTS.md', content: templateCogAgents },
    { name: 'SOUL.md', content: templateCogSoul },
    { name: 'TOOLS.md', content: templateCogTools },
  ],
  'expectation-planning': [
    { name: 'AGENTS.md', content: templateExpAgents },
    { name: 'SOUL.md', content: templateExpSoul },
    { name: 'TOOLS.md', content: templateExpTools },
  ],
};

const STANDARD_ROLE_FILES: readonly RoleMd[] = ['AGENTS.md', 'SOUL.md', 'TOOLS.md'];

function isSystemRoleTemplateId(id: SubAgentRoleTemplateId): id is SystemRoleTemplateId {
  return id === 'skills' || id === 'cognitive-allocation' || id === 'expectation-planning';
}

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

async function readRoleMarkdownParts(roleTemplateId: SystemRoleTemplateId): Promise<string> {
  const baseDir = systemSubagentRolesDirAbs();
  const dir = path.join(baseDir, roleTemplateId);
  const parts: string[] = [];
  for (const name of STANDARD_ROLE_FILES) {
    try {
      const body = await fs.promises.readFile(path.join(dir, name), 'utf-8');
      parts.push(body.trimEnd());
    } catch {
      const fallback = SYSTEM_ROLE_TEMPLATES[roleTemplateId]?.find((x) => x.name === name)?.content;
      if (fallback) parts.push(String(fallback).trimEnd());
    }
  }
  return parts.join('\n\n');
}

export async function buildSystemSubAgentRoleSystemContent(
  roleTemplateId: SubAgentRoleTemplateId
): Promise<string> {
  if (!isSystemRoleTemplateId(roleTemplateId)) return '';
  return readRoleMarkdownParts(roleTemplateId);
}

/** @deprecated 使用 buildSystemSubAgentRoleSystemContent('cognitive-allocation') */
export async function buildCognitiveAllocationSystemPrompt(): Promise<string> {
  return buildSystemSubAgentRoleSystemContent('cognitive-allocation');
}
