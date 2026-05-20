import * as fs from 'fs';
import * as path from 'path';
import type { SubAgentRoleTemplateId } from '../../shared/sub-agent-types';
import { systemSubagentRolesDirAbs } from './system-agent-layout';

import templateDeduceEvolutionAgents from '../../workspace-templates/subagent-roles/deduce-evolution/AGENTS.md';
import templateDeduceEvolutionRule from '../../workspace-templates/subagent-roles/deduce-evolution/RULE.md';
import templateDeduceEvolutionTools from '../../workspace-templates/subagent-roles/deduce-evolution/TOOLS.md';

import templateCogAgents from '../../workspace-templates/subagent-roles/cognitive-allocation/AGENTS.md';
import templateCogSoul from '../../workspace-templates/subagent-roles/cognitive-allocation/SOUL.md';
import templateCogTools from '../../workspace-templates/subagent-roles/cognitive-allocation/TOOLS.md';

import templateExpAgents from '../../workspace-templates/subagent-roles/expectation-planning/AGENTS.md';
import templateExpSoul from '../../workspace-templates/subagent-roles/expectation-planning/SOUL.md';
import templateExpTools from '../../workspace-templates/subagent-roles/expectation-planning/TOOLS.md';

export type SystemRoleTemplateId = 'deduce-evolution' | 'cognitive-allocation' | 'expectation-planning';

type RoleTemplateFile = { name: string; content: string };

const SYSTEM_ROLE_TEMPLATES: Record<SystemRoleTemplateId, RoleTemplateFile[]> = {
  'deduce-evolution': [
    { name: 'AGENTS.md', content: templateDeduceEvolutionAgents },
    { name: 'RULE.md', content: templateDeduceEvolutionRule },
    { name: 'TOOLS.md', content: templateDeduceEvolutionTools },
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

/** @deprecated 旧模板 id，读取时映射到 deduce-evolution */
const LEGACY_DEDUCE_EVOLUTION_TEMPLATE_ID = 'skill-evolution';

function isSystemRoleTemplateId(id: SubAgentRoleTemplateId): id is SystemRoleTemplateId {
  return id === 'deduce-evolution' || id === 'cognitive-allocation' || id === 'expectation-planning';
}

function resolveSystemRoleTemplateId(id: SubAgentRoleTemplateId): SystemRoleTemplateId | null {
  if (id === LEGACY_DEDUCE_EVOLUTION_TEMPLATE_ID) return 'deduce-evolution';
  return isSystemRoleTemplateId(id) ? id : null;
}

function roleFilesForTemplate(id: SystemRoleTemplateId): readonly string[] {
  return SYSTEM_ROLE_TEMPLATES[id].map((f) => f.name);
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
  for (const name of roleFilesForTemplate(roleTemplateId)) {
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
  const resolved = resolveSystemRoleTemplateId(roleTemplateId);
  if (!resolved) return '';
  return readRoleMarkdownParts(resolved);
}

/** @deprecated 使用 buildSystemSubAgentRoleSystemContent('cognitive-allocation') */
export async function buildCognitiveAllocationSystemPrompt(): Promise<string> {
  return buildSystemSubAgentRoleSystemContent('cognitive-allocation');
}
