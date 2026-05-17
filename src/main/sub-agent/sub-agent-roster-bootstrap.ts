/**
 * 工作区子 Agent 固定名册：仅 4 个可委派槽位。系统级 Agent（Skill / 认知分配）见 `system-agent-roster-bootstrap`。
 */

import type { SubAgentSlot } from '../../shared/sub-agent-types';
import { readSubAgentSlots, writeSubAgentSlots } from './sub-agent-service';
import { broadcastSubAgentsUpdated } from './sub-agent-broadcast';
import { isSystemSubAgentSlotId } from '../../shared/system-agent-constants';
import { STANDARD_SUB_AGENT_ROSTER } from '../../shared/sub-agent-roster-constants';
import { readWorkspaceToolManifest } from '../workspace/workspace-service';
import { ensureSubagentWorkspaceTree } from '../workspace/workspace-service';
import { ensureWorkspaceSubAgentRoleTemplates } from '../workspace/workspace-subagent-role-bootstrap';
import { pruneSystemSubagentArtifactsFromWorkspace } from './workspace-subagent-artifacts';

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

/** 生成当前工作区应有的委派槽位列表（不含系统级 Agent） */
export async function buildCanonicalSubAgentSlots(workspaceRoot: string): Promise<SubAgentSlot[]> {
  const root = String(workspaceRoot || '').trim();
  if (!root) return [];
  const existing = (await readSubAgentSlots(root)).filter((s) => !isSystemSubAgentSlotId(s.id));
  const byId = new Map(existing.map((s) => [s.id, s]));

  const out: SubAgentSlot[] = [];
  for (const def of STANDARD_SUB_AGENT_ROSTER) {
    out.push(mergeStandardSlot(def, byId.get(def.id)));
  }
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

  await pruneSystemSubagentArtifactsFromWorkspace(root);

  const tools = await readWorkspaceToolManifest(root);
  if (tools.subagents) {
    await ensureSubagentWorkspaceTree(root);
    try {
      await ensureWorkspaceSubAgentRoleTemplates(root);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn('[sub-agent-roster] ensureWorkspaceSubAgentRoleTemplates failed:', msg);
    }
  }

  await pruneSystemSubagentArtifactsFromWorkspace(root);

  const next = await buildCanonicalSubAgentSlots(root);
  const cur = (await readSubAgentSlots(root)).filter((s) => !isSystemSubAgentSlotId(s.id));
  if (!slotsEqual(cur, next)) {
    await writeSubAgentSlots(root, next);
    broadcastSubAgentsUpdated(root);
  }
  const { refreshSystemSkillAgentForWorkspace } = await import('../system-agents/system-agent-roster-bootstrap');
  await refreshSystemSkillAgentForWorkspace(root);
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
