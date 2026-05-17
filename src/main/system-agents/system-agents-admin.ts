import * as path from 'path';
import type { SubAgentSlot, SubAgentRunSnapshot } from '../../shared/sub-agent-types';
import type { SystemAgentSettings } from '../../shared/system-agent-settings';
import { readWorkspaceToolManifest } from '../workspace/workspace-service';
import {
  systemAgentsRootAbs,
  systemClawflowDirAbs,
  systemSubagentRolesDirAbs,
  systemSubclawflowSlotDirAbs,
  systemSubmemorySlotDirAbs,
} from './system-agent-layout';
import { readSystemSubAgentSlots, writeSystemSubAgentSlots } from './system-agent-service';
import { buildCanonicalSystemAgentSlots, ensureSystemAgentsInitialized } from './system-agent-roster-bootstrap';
import { readSystemAgentSettings, writeSystemAgentSettings } from './system-agent-settings-service';
import { readAllSystemRunSnapshots } from './system-agent-run-snapshot';
import { isSystemSubAgentSlotId } from '../../shared/system-agent-constants';

export type SystemAgentOverviewSlot = {
  slot: SubAgentSlot;
  roleTemplateId: string;
  subclawflowDir: string;
  submemoryDir: string;
  snapshot: SubAgentRunSnapshot | null;
};

export type SystemAgentOverview = {
  systemRoot: string;
  rosterPath: string;
  rolesDir: string;
  settingsPath: string;
  settings: SystemAgentSettings;
  slots: SystemAgentOverviewSlot[];
  activeWorkspaceSkillsEnabled: boolean | null;
};

export async function getSystemAgentOverview(workspaceRoot?: string): Promise<SystemAgentOverview> {
  const root = String(workspaceRoot ?? '').trim();
  let skillsEnabled: boolean | null = null;
  if (root) {
    try {
      const tools = await readWorkspaceToolManifest(root);
      skillsEnabled = Boolean(tools.skills);
    } catch {
      skillsEnabled = null;
    }
  }

  await ensureSystemAgentsInitialized(skillsEnabled ?? true);
  const slots = await buildCanonicalSystemAgentSlots(skillsEnabled ?? true);
  const snapshots = await readAllSystemRunSnapshots();
  const settings = await readSystemAgentSettings();

  return {
    systemRoot: systemAgentsRootAbs(),
    rosterPath: path.join(systemClawflowDirAbs(), 'sub-agents.v1.json'),
    rolesDir: systemSubagentRolesDirAbs(),
    settingsPath: path.join(systemClawflowDirAbs(), 'system-agent-settings.v1.json'),
    settings,
    activeWorkspaceSkillsEnabled: skillsEnabled,
    slots: slots.map((slot) => ({
      slot,
      roleTemplateId: slot.roleTemplateId ?? 'assistant',
      subclawflowDir: systemSubclawflowSlotDirAbs(slot.id),
      submemoryDir: systemSubmemorySlotDirAbs(slot.id),
      snapshot: snapshots[slot.id] ?? null,
    })),
  };
}

export async function saveSystemAgentSlotPatches(
  patches: Array<{ id: string; label?: string; behavior?: string }>,
  workspaceRoot?: string
): Promise<SubAgentSlot[]> {
  const root = String(workspaceRoot ?? '').trim();
  let skillsEnabled = true;
  if (root) {
    const tools = await readWorkspaceToolManifest(root);
    skillsEnabled = Boolean(tools.skills);
  }
  const slots = await buildCanonicalSystemAgentSlots(skillsEnabled);
  const byId = new Map(slots.map((s) => [s.id, { ...s }]));

  for (const p of patches) {
    const id = String(p.id ?? '').trim();
    if (!isSystemSubAgentSlotId(id)) continue;
    const cur = byId.get(id);
    if (!cur) continue;
    if (typeof p.label === 'string') {
      const label = p.label.trim();
      if (label) cur.label = label;
    }
    if (typeof p.behavior === 'string') {
      cur.behavior = p.behavior.trim();
    }
    byId.set(id, cur);
  }

  const next = Array.from(byId.values());
  await writeSystemSubAgentSlots(next);
  return next;
}

export async function reloadSystemAgentRoster(workspaceRoot?: string): Promise<SubAgentSlot[]> {
  const root = String(workspaceRoot ?? '').trim();
  let skillsEnabled = true;
  if (root) {
    const tools = await readWorkspaceToolManifest(root);
    skillsEnabled = Boolean(tools.skills);
  }
  await ensureSystemAgentsInitialized(skillsEnabled);
  return readSystemSubAgentSlots();
}
