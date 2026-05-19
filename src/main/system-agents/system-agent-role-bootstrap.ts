import * as fs from 'fs';
import * as path from 'path';
import type { SubAgentRoleTemplateId } from '../../shared/sub-agent-types';
import { systemSubagentRolesDirAbs } from './system-agent-layout';

import templateSkillEvolutionAgents from '../../workspace-templates/subagent-roles/skill-evolution/AGENTS.md';
import templateSkillEvolutionSoul from '../../workspace-templates/subagent-roles/skill-evolution/SOUL.md';
import templateSkillEvolutionTools from '../../workspace-templates/subagent-roles/skill-evolution/TOOLS.md';

import templateCogAgents from '../../workspace-templates/subagent-roles/cognitive-allocation/AGENTS.md';
import templateCogSoul from '../../workspace-templates/subagent-roles/cognitive-allocation/SOUL.md';
import templateCogTools from '../../workspace-templates/subagent-roles/cognitive-allocation/TOOLS.md';

import templateExpAgents from '../../workspace-templates/subagent-roles/expectation-planning/AGENTS.md';
import templateExpSoul from '../../workspace-templates/subagent-roles/expectation-planning/SOUL.md';
import templateExpTools from '../../workspace-templates/subagent-roles/expectation-planning/TOOLS.md';

type RoleMd = 'AGENTS.md' | 'SOUL.md' | 'TOOLS.md';

export type SystemRoleTemplateId = 'skill-evolution' | 'cognitive-allocation' | 'expectation-planning';

const SYSTEM_ROLE_TEMPLATES: Record<SystemRoleTemplateId, Array<{ name: RoleMd; content: string }>> = {
  'skill-evolution': [
    { name: 'AGENTS.md', content: templateSkillEvolutionAgents },
    { name: 'SOUL.md', content: templateSkillEvolutionSoul },
    { name: 'TOOLS.md', content: templateSkillEvolutionTools },
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
  return id === 'skill-evolution' || id === 'cognitive-allocation' || id === 'expectation-planning';
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
  const dir = path.join(systemSubagentRolesDirAbs(), roleTemplateId);
  const parts: string[] = [];
  for (const name of STANDARD_ROLE_FILES) {
    let body: string | null = null;
    try {
      body = await fs.promises.readFile(path.join(dir, name), 'utf-8');
    } catch {
      /* use bundled fallback */
    }
    if (body != null) {
      parts.push(body.trimEnd());
      continue;
    }
    const fallback = SYSTEM_ROLE_TEMPLATES[roleTemplateId]?.find((x) => x.name === name)?.content;
    if (fallback) parts.push(String(fallback).trimEnd());
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
