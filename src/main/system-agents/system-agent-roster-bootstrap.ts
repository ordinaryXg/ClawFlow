import * as fs from 'fs';
import type { SubAgentSlot } from '../../shared/sub-agent-types';
import { readWorkspaceToolManifest } from '../workspace/workspace-service';
import { buildDefaultSkillAgentSlot } from '../skill/skill-agent-defaults';
import {
  COGNITIVE_ALLOCATION_AGENT_SLOT_ID,
  EXPECTATION_PLANNING_AGENT_SLOT_ID,
  SKILL_AGENT_SLOT_ID,
} from '../../shared/system-agent-constants';
import { readSystemSubAgentSlots, writeSystemSubAgentSlots } from './system-agent-service';
import { ensureSystemSubAgentRoleTemplates } from './system-agent-role-bootstrap';
import {
  systemSubagentRootAbs,
  systemSubclawflowDirAbs,
  systemSubmemoryDirAbs,
  systemSubclawflowSlotDirAbs,
  systemSubmemorySlotDirAbs,
} from './system-agent-layout';
import { SYSTEM_SUB_AGENT_SLOT_IDS_ORDERED } from '../../shared/system-agent-constants';

function buildDefaultCognitiveAllocationSlot(): SubAgentSlot {
  return {
    id: COGNITIVE_ALLOCATION_AGENT_SLOT_ID,
    label: '认知分配 Agent',
    behavior:
      '系统级子 Agent：在每次主对话发送前，根据用户消息判定 M1–M5 处理模式并输出 JSON（category + summary）。不回答用户问题、不使用工具。',
    roleTemplateId: 'cognitive-allocation',
    status: 'running',
    delegatable: false,
  };
}

function buildDefaultExpectationPlanningSlot(): SubAgentSlot {
  return {
    id: EXPECTATION_PLANNING_AGENT_SLOT_ID,
    label: '预期规划 Agent',
    behavior:
      '系统级子 Agent：对复杂任务产出 JSON 规划（目标、假设、是否外部调研、步骤、安全边界、验收标准、风险）。被显式调度时运行，不替代主会话日常问答。',
    roleTemplateId: 'expectation-planning',
    status: 'running',
    delegatable: false,
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
      roleTemplateId: 'skill-evolution',
      delegatable: false,
      skillToolsEnabled: false,
    };
  }
  const st = prev?.status;
  let status: SubAgentSlot['status'] = 'running';
  if (st === 'starting' || st === 'running') status = st;
  else if (st === 'error') status = 'error';
  return {
    ...d,
    label,
    behavior,
    status,
    roleTemplateId: 'skill-evolution',
    delegatable: false,
    skillToolsEnabled: true,
  };
}

function mergeSystemSlot(
  prev: SubAgentSlot | undefined,
  defaults: SubAgentSlot
): SubAgentSlot {
  return {
    ...defaults,
    label: (prev?.label ?? '').trim() || defaults.label,
    behavior: (prev?.behavior ?? '').trim() || defaults.behavior,
    status: prev?.status === 'error' ? 'error' : 'running',
  };
}

/** 系统名册：Skill / 认知分配 / 预期规划（不写工作区） */
export async function buildCanonicalSystemAgentSlots(skillsEnabled: boolean): Promise<SubAgentSlot[]> {
  const existing = await readSystemSubAgentSlots();
  const byId = new Map(existing.map((s) => [s.id, s]));
  return [
    mergeSkillSlot(byId.get(SKILL_AGENT_SLOT_ID), skillsEnabled),
    mergeSystemSlot(byId.get(COGNITIVE_ALLOCATION_AGENT_SLOT_ID), buildDefaultCognitiveAllocationSlot()),
    mergeSystemSlot(byId.get(EXPECTATION_PLANNING_AGENT_SLOT_ID), buildDefaultExpectationPlanningSlot()),
  ];
}

async function ensureSystemAgentTree(): Promise<void> {
  const root = systemSubagentRootAbs();
  await fs.promises.mkdir(systemSubclawflowDirAbs(), { recursive: true });
  await fs.promises.mkdir(systemSubmemoryDirAbs(), { recursive: true });
  await fs.promises.mkdir(root, { recursive: true });
  for (const sid of SYSTEM_SUB_AGENT_SLOT_IDS_ORDERED) {
    await fs.promises.mkdir(systemSubclawflowSlotDirAbs(sid), { recursive: true });
    await fs.promises.mkdir(systemSubmemorySlotDirAbs(sid), { recursive: true });
  }
}

/**
 * 应用启动时调用：初始化系统 Agent 目录、角色模板与名册。
 * `skillsEnabled` 由当前活动工作区 manifest 决定（无工作区时视为 true 以便 Skill Agent 待命）。
 */
export async function ensureSystemAgentsInitialized(skillsEnabled = true): Promise<void> {
  await ensureSystemAgentTree();
  await ensureSystemSubAgentRoleTemplates();
  const next = await buildCanonicalSystemAgentSlots(skillsEnabled);
  const cur = await readSystemSubAgentSlots();
  if (JSON.stringify(cur) !== JSON.stringify(next)) {
    await writeSystemSubAgentSlots(next);
  }
}

/** 工作区 tools.skills 变更后刷新系统 Skill Agent 状态 */
export async function refreshSystemSkillAgentForWorkspace(workspaceRoot: string): Promise<void> {
  const root = String(workspaceRoot ?? '').trim();
  if (!root) return;
  const tools = await readWorkspaceToolManifest(root);
  await ensureSystemAgentsInitialized(Boolean(tools.skills));
}
