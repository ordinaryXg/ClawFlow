/**
 * 工作区子 Agent 固定名册：始终包含 4 个委派槽 + Skill Agent；不提供任意新建/删除。
 * `tools.skills` 关闭时 Skill 槽位仍存在（`skillToolsEnabled: false`，状态 stopped），便于 UI 一览。
 */

import type { SubAgentSlot } from './shared/sub-agent-types';
import { readSubAgentSlots, writeSubAgentSlots } from './sub-agent-service';
import { readWorkspaceToolManifest } from './workspace-service';
import { broadcastSubAgentsUpdated } from './sub-agent-broadcast';
import { SKILL_AGENT_SLOT_ID } from './shared/skill-agent-constants';
import { STANDARD_SUB_AGENT_ROSTER } from './shared/sub-agent-roster-constants';
import { buildDefaultSkillAgentSlot } from './skill-agent-defaults';

function normalizeStatus(st: unknown): SubAgentSlot['status'] | undefined {
  if (st === 'stopped' || st === 'starting' || st === 'running' || st === 'error') return st;
  return undefined;
}

function mergeStandardSlot(def: (typeof STANDARD_SUB_AGENT_ROSTER)[number], prev: SubAgentSlot | undefined): SubAgentSlot {
  const label = (prev?.label ?? '').trim() || def.defaultLabel;
  const behavior = (prev?.behavior ?? '').trim() || def.defaultBehavior;
  const status = normalizeStatus(prev?.status) ?? 'stopped';
  return {
    id: def.id,
    label,
    behavior,
    roleTemplateId: def.roleTemplateId,
    status,
    delegatable: true,
  };
}

function mergeSkillSlot(prev: SubAgentSlot | undefined, skillsEnabled: boolean): SubAgentSlot {
  const d = buildDefaultSkillAgentSlot();
  const label = (prev?.label ?? '').trim() || d.label;
  const behavior = (prev?.behavior ?? '').trim() || d.behavior;
  if (!skillsEnabled) {
    return {
      ...d,
      label,
      behavior,
      status: 'stopped',
      roleTemplateId: 'skills',
      delegatable: false,
      skillToolsEnabled: false,
    };
  }
  const st = normalizeStatus(prev?.status);
  let status: SubAgentSlot['status'];
  if (st === 'starting' || st === 'running') status = st;
  else if (st === 'error') status = 'error';
  else status = 'running';
  return {
    ...d,
    label,
    behavior,
    status,
    roleTemplateId: 'skills',
    delegatable: false,
    skillToolsEnabled: true,
  };
}

/** 生成当前工作区应有的完整槽位列表（不写盘） */
export async function buildCanonicalSubAgentSlots(workspaceRoot: string): Promise<SubAgentSlot[]> {
  const root = String(workspaceRoot || '').trim();
  if (!root) return [];
  const tools = await readWorkspaceToolManifest(root);
  const existing = await readSubAgentSlots(root);
  const byId = new Map(existing.map((s) => [s.id, s]));

  const out: SubAgentSlot[] = [];
  for (const def of STANDARD_SUB_AGENT_ROSTER) {
    out.push(mergeStandardSlot(def, byId.get(def.id)));
  }
  out.push(mergeSkillSlot(byId.get(SKILL_AGENT_SLOT_ID), Boolean(tools.skills)));
  return out;
}

function slotsEqual(a: SubAgentSlot[], b: SubAgentSlot[]): boolean {
  if (a.length !== b.length) return false;
  return JSON.stringify(a) === JSON.stringify(b);
}

/** 将磁盘上的子 Agent 列表规范为完整名册（缺则补、多余则删），必要时写盘并广播 */
export async function ensureSubAgentRosterForWorkspace(workspaceRoot: string): Promise<void> {
  const root = String(workspaceRoot || '').trim();
  if (!root) return;
  const next = await buildCanonicalSubAgentSlots(root);
  const cur = await readSubAgentSlots(root);
  if (!slotsEqual(cur, next)) {
    await writeSubAgentSlots(root, next);
    broadcastSubAgentsUpdated(root);
  }
}

/**
 * UI「保存全部」后与名册合并：仅接受名册内 id 的 label/behavior 覆盖；角色/委派标志以名册为准。
 */
export async function mergeSubAgentSlotsAfterEditorSave(
  workspaceRoot: string,
  incoming: SubAgentSlot[]
): Promise<SubAgentSlot[]> {
  const base = await buildCanonicalSubAgentSlots(workspaceRoot);
  const byId = new Map(base.map((s) => [s.id, { ...s }]));
  for (const inc of incoming) {
    if (!inc?.id) continue;
    const t = byId.get(inc.id);
    if (!t) continue;
    if ((inc.label ?? '').trim()) t.label = String(inc.label).trim();
    if (typeof inc.behavior === 'string') t.behavior = inc.behavior;
  }
  return base.map((s) => byId.get(s.id) ?? s);
}
