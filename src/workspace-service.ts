/**
 * Workspace 目录与注册表（主进程）。
 * 每个 workspace 根下：**`.agent/`**（主 Agent、工具、技能、`.memory/`、主会话数据 **`.clawflow/`**）；**`.subagent/`**（子 Agent 缓存 `.subclawflow/`、记忆 `.submemory/`、角色模板 `.subroleAgent/`）。
 */

import { randomUUID } from 'crypto';
import { app, BrowserWindow, dialog, OpenDialogOptions } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { ensureWorkspaceAgentRoleTemplates } from './workspace-agent-bootstrap';
import { ensureWorkspaceSubAgentRoleTemplates } from './workspace-subagent-role-bootstrap';
import { ensureWorkspaceDefaultHermesSkill } from './workspace-hermes-skill-bootstrap';
import { ensureWorkspaceMainMemoryTemplates } from './workspace-main-memory-bootstrap';
import {
  migrateLegacyWorkspaceAgentBundleSync,
  WORKSPACE_AGENT_DIR,
  workspaceAgentDotMemoryDirAbs,
  workspaceSubagentRolesDirAbs,
  workspaceToolDirAbs,
} from './workspace-agent-layout';
import { ensureSkillAgentSlotForWorkspace } from './skill-agent-bootstrap';
import {
  mergeToolSelection,
  WORKSPACE_TOOL_IDS,
  type WorkspaceToolId,
  type WorkspaceToolSelection,
  type WorkspaceToolSelectionInput,
} from './shared/workspace-tools';
import { ALL_SUBAGENT_SLOT_IDS_ORDERED } from './shared/sub-agent-roster-constants';
import {
  buildWorkspaceToolBrowserMd,
  buildWorkspaceToolDocsMd,
  buildWorkspaceToolGitMd,
  buildWorkspaceToolKnowledgeBaseMd,
  buildWorkspaceToolSkillsMd,
  buildWorkspaceToolSubagentsMd,
  buildWorkspaceToolTodosMd,
} from './shared/workspace-tool-template-md';

export type { WorkspaceToolId, WorkspaceToolSelection } from './shared/workspace-tools';

/** 工作区内主会话与调度等元数据（位于 `.agent/` 下） */
export const CLAWFLOW_DIR = '.agent/.clawflow';

/** 子 Agent 根目录（工作区根下） */
export const SUBAGENT_ROOT_DIR = '.subagent';

/** 子 Agent 工作区缓存根（`.subagent/.subclawflow/`，按槽位分子目录） */
export const SUBCLAWFLOW_DIR = '.subagent/.subclawflow';

/** 子 Agent 记忆根（`.subagent/.submemory/`，按槽位分子目录） */
export const SUBMEMORY_DIR = '.subagent/.submemory';

/**
 * 仅从工作区根删除 ClawFlow 管理的目录，不删除用户项目文件。
 * 含 `.agent/`（内含 `.clawflow/`）、`.subagent/` 及历史遗留根下 `.clawflow`、`.subclawflow`、`.submemory`、`.roleAgent`、`.tool`；各目录不存在时忽略。
 */
export async function removeWorkspaceManagedMetadataDirs(workspaceRoot: string): Promise<void> {
  const root = path.resolve(workspaceRoot);
  const dirs = [
    path.join(root, WORKSPACE_AGENT_DIR),
    path.join(root, SUBAGENT_ROOT_DIR),
    path.join(root, '.clawflow'),
    path.join(root, '.subclawflow'),
    path.join(root, '.submemory'),
    path.join(root, '.roleAgent'),
    path.join(root, '.tool'),
  ];
  for (const d of dirs) {
    try {
      await fs.promises.rm(d, { recursive: true, force: true });
    } catch {
      /* ENOENT 等 */
    }
  }
}

function toolBundleDir(workspaceRoot: string): string {
  return workspaceToolDirAbs(workspaceRoot);
}

/**
 * 确保 `.agent/.tool/` 与说明文件存在；若传入 tools 或目录尚不存在，则写入 manifest。
 */
export async function ensureWorkspaceToolBundle(
  workspaceRoot: string,
  tools?: WorkspaceToolSelection | null
): Promise<void> {
  const root = path.resolve(workspaceRoot);
  const dir = toolBundleDir(root);
  let dirExists = false;
  try {
    const st = await fs.promises.stat(dir);
    dirExists = st.isDirectory();
  } catch {
    dirExists = false;
  }
  const merged = mergeToolSelection(tools ?? undefined);
  const shouldWriteManifest = tools != null || !dirExists;
  await fs.promises.mkdir(dir, { recursive: true });
  if (shouldWriteManifest) {
    const manifest = { version: 2 as const, tools: merged, updatedAt: Date.now() };
    await fs.promises.writeFile(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf-8');
  }

  const writeIfMissing = async (name: string, body: string) => {
    const fp = path.join(dir, name);
    try {
      await fs.promises.access(fp);
    } catch {
      await fs.promises.writeFile(fp, body, 'utf-8');
    }
  };

  // `.agent/.tool/README.md`：避免与 `.agent/.roleAgent/TOOLS.md` 重复，仅保留指引（覆盖写入）。
  // 该目录属于 ClawFlow 管理目录，README 用作“入口跳转”而非完整说明。
  try {
    const readme = [
      '# .tool 说明（入口）',
      '',
      '本目录由 ClawFlow 管理，包含工作区工具能力的开关与契约说明。',
      '',
      '- 总览入口：请阅读工作区内 `.agent/.roleAgent/TOOLS.md`',
      '- 能力开关：`manifest.json`',
      '- 契约说明：`docs.md` / `browser.md` / `git.md` / `todos.md` / `subagents.md` / `skills.md` / `knowledge_base.md`',
      '',
    ].join('\n');
    await fs.promises.writeFile(path.join(dir, 'README.md'), readme, 'utf-8');
  } catch {
    /* ignore */
  }

  const docsBody = buildWorkspaceToolDocsMd();
  const browserBody = buildWorkspaceToolBrowserMd();
  const gitBody = buildWorkspaceToolGitMd();
  const todosBody = buildWorkspaceToolTodosMd();
  const subagentsBody = buildWorkspaceToolSubagentsMd();
  const skillsBody = buildWorkspaceToolSkillsMd();
  const kbBody = buildWorkspaceToolKnowledgeBaseMd();

  await writeIfMissing('docs.md', docsBody.endsWith('\n') ? docsBody : `${docsBody}\n`);
  await writeIfMissing('browser.md', browserBody.endsWith('\n') ? browserBody : `${browserBody}\n`);
  await writeIfMissing('git.md', gitBody.endsWith('\n') ? gitBody : `${gitBody}\n`);
  await writeIfMissing('todos.md', todosBody.endsWith('\n') ? todosBody : `${todosBody}\n`);
  await writeIfMissing('subagents.md', subagentsBody.endsWith('\n') ? subagentsBody : `${subagentsBody}\n`);
  await writeIfMissing('skills.md', skillsBody.endsWith('\n') ? skillsBody : `${skillsBody}\n`);
  await writeIfMissing('knowledge_base.md', kbBody.endsWith('\n') ? kbBody : `${kbBody}\n`);
}

const LEGACY_MANIFEST_TOOL_KEYS = new Set<string>([
  ...WORKSPACE_TOOL_IDS,
  'browser', // v1 总开关
]);

/** 读取 `.agent/.tool/manifest.json` 中的 tools；缺失则返回默认全开；兼容 v1 `browser` */
export async function readWorkspaceToolManifest(workspaceRoot: string): Promise<Record<WorkspaceToolId, boolean>> {
  const fp = path.join(toolBundleDir(workspaceRoot), 'manifest.json');
  try {
    const buf = await fs.promises.readFile(fp, 'utf-8');
    const parsed = JSON.parse(buf) as { tools?: unknown; version?: unknown };
    if (parsed && typeof parsed === 'object' && parsed.tools && typeof parsed.tools === 'object') {
      const raw = parsed.tools as Record<string, unknown>;
      for (const k of Object.keys(raw)) {
        if (!LEGACY_MANIFEST_TOOL_KEYS.has(k)) {
          console.warn(`[workspace-service] manifest.json: ignoring unknown tools key "${k}"`);
        }
      }
      return mergeToolSelection(raw as WorkspaceToolSelectionInput);
    }
  } catch {
    /* no manifest */
  }
  return mergeToolSelection(undefined);
}

/** 更新能力勾选并写入 `.agent/.tool/manifest.json`（并确保说明文件存在） */
export async function writeWorkspaceToolSelection(workspaceRoot: string, tools: WorkspaceToolSelection): Promise<void> {
  await ensureWorkspaceToolBundle(workspaceRoot, tools);
  await ensureSkillAgentSlotForWorkspace(workspaceRoot);
}

export interface WorkspaceMeta {
  id: string;
  name: string;
  createdAt: number;
  lastOpened: number;
  /** 通过「Git 克隆」创建工作区时写入；用于侧栏显示拉取/推送 */
  gitRemoteUrl?: string;
}

export interface WorkspaceRegistry {
  activeWorkspacePath: string | null;
  recentWorkspacePaths: string[];
  /** 兼容迁移标记：旧版本会把 active 置顶到 recent[0] */
  unpinActiveMigrated?: boolean;
}

const REGISTRY_FILENAME = 'cf.workspace.v1.json';

export function getRegistryPath(): string {
  return path.join(app.getPath('userData'), REGISTRY_FILENAME);
}

/** 默认 workspace：位于 userData 下的固定文件夹名 `WorkSpace`（旧版曾为 `Default Workspace`，可手动删除遗留目录）。 */
export function getDefaultWorkspacePath(): string {
  return path.join(app.getPath('userData'), 'WorkSpace');
}

/** 比较两个 workspace 根路径是否相同（Windows 忽略大小写）。 */
export function isSameWorkspacePath(a: string, b: string): boolean {
  const ra = path.resolve(a);
  const rb = path.resolve(b);
  if (process.platform === 'win32') return ra.toLowerCase() === rb.toLowerCase();
  return ra === rb;
}

export function clawflowDir(workspaceRoot: string): string {
  return path.join(path.resolve(workspaceRoot), CLAWFLOW_DIR);
}

export function subagentRootDir(workspaceRoot: string): string {
  return path.join(path.resolve(workspaceRoot), SUBAGENT_ROOT_DIR);
}

export function subclawflowDir(workspaceRoot: string): string {
  return path.join(path.resolve(workspaceRoot), SUBCLAWFLOW_DIR);
}

/**
 * 单个子 Agent 槽位在工作区下的缓存根目录（绝对路径）。
 * 与主会话元数据 `.agent/.clawflow/` 分离；中间产物、草稿、本子 Agent 专属落盘可放此处对应子目录。
 */
export function subclawflowSlotDirAbs(workspaceRoot: string, slotId: string): string {
  const id = String(slotId ?? '').trim();
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) return subclawflowDir(workspaceRoot);
  return path.join(subclawflowDir(workspaceRoot), id);
}

export function submemoryDir(workspaceRoot: string): string {
  return path.join(path.resolve(workspaceRoot), SUBMEMORY_DIR);
}

/** 单个子 Agent 槽位在工作区下的记忆根目录（绝对路径）；与主 `.agent/.memory/` 分离。 */
export function submemorySlotDirAbs(workspaceRoot: string, slotId: string): string {
  const id = String(slotId ?? '').trim();
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) return submemoryDir(workspaceRoot);
  return path.join(submemoryDir(workspaceRoot), id);
}

/** 确保 `.subagent/`、`.subclawflow/`、`.submemory/`、`.subroleAgent/` 根目录及固定名册各槽位子目录存在（失败打日志，便于排查） */
export async function ensureSubagentWorkspaceTree(workspaceRoot: string): Promise<void> {
  const root = path.resolve(String(workspaceRoot ?? '').trim());
  if (!root) return;
  try {
    await fs.promises.mkdir(subagentRootDir(root), { recursive: true });
    await fs.promises.mkdir(workspaceSubagentRolesDirAbs(root), { recursive: true });
    await fs.promises.mkdir(subclawflowDir(root), { recursive: true });
    await fs.promises.mkdir(submemoryDir(root), { recursive: true });
    for (const sid of ALL_SUBAGENT_SLOT_IDS_ORDERED) {
      await fs.promises.mkdir(subclawflowSlotDirAbs(root, sid), { recursive: true });
      await fs.promises.mkdir(submemorySlotDirAbs(root, sid), { recursive: true });
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn('[workspace-service] ensureSubagentWorkspaceTree failed:', msg);
  }
}

/** 确保 `.subclawflow/` 及固定名册各槽位子目录存在 */
export async function ensureSubclawflowWorkspaceCaches(workspaceRoot: string): Promise<void> {
  const root = path.resolve(String(workspaceRoot || '').trim());
  if (!root) return;
  try {
    await fs.promises.mkdir(subagentRootDir(root), { recursive: true });
    await fs.promises.mkdir(subclawflowDir(root), { recursive: true });
    for (const sid of ALL_SUBAGENT_SLOT_IDS_ORDERED) {
      await fs.promises.mkdir(subclawflowSlotDirAbs(root, sid), { recursive: true });
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn('[workspace-service] ensureSubclawflowWorkspaceCaches failed:', msg);
  }
}

/** 确保 `.submemory/` 及固定名册各槽位子目录存在（子 Agent 专用记忆，与主会话隔离） */
export async function ensureSubmemoryWorkspaceCaches(workspaceRoot: string): Promise<void> {
  const root = path.resolve(String(workspaceRoot || '').trim());
  if (!root) return;
  try {
    await fs.promises.mkdir(subagentRootDir(root), { recursive: true });
    await fs.promises.mkdir(submemoryDir(root), { recursive: true });
    for (const sid of ALL_SUBAGENT_SLOT_IDS_ORDERED) {
      await fs.promises.mkdir(submemorySlotDirAbs(root, sid), { recursive: true });
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn('[workspace-service] ensureSubmemoryWorkspaceCaches failed:', msg);
  }
}

export function workspaceMetaPath(workspaceRoot: string): string {
  return path.join(clawflowDir(workspaceRoot), 'workspace.json');
}

export function conversationsStorePath(workspaceRoot: string): string {
  return path.join(clawflowDir(workspaceRoot), 'conversations.json');
}

/** 待办触发器列表（每工作区一份） */
export function todoTriggersStorePath(workspaceRoot: string): string {
  return path.join(clawflowDir(workspaceRoot), 'todo-triggers.v1.json');
}

export function openclawStateDir(workspaceRoot: string): string {
  return path.join(clawflowDir(workspaceRoot), 'openclaw');
}

export function openclawConfigPath(workspaceRoot: string): string {
  return path.join(openclawStateDir(workspaceRoot), 'openclaw.json');
}

/** 应用级共享：模型鉴权与 OpenClaw 状态（不随工作区切换变化） */
export function globalClawflowRoot(): string {
  return path.join(app.getPath('userData'), CLAWFLOW_DIR);
}

export function globalOpenclawStateDir(): string {
  return path.join(globalClawflowRoot(), 'openclaw');
}

export function globalOpenclawConfigPath(): string {
  return path.join(globalOpenclawStateDir(), 'openclaw.json');
}

/** 注册表里出现过的 workspace 根路径（活跃、最近、默认），用于迁移与清理。 */
export function registeredWorkspaceRootCandidates(reg?: WorkspaceRegistry): string[] {
  const r = reg ?? loadRegistry();
  const candidates: string[] = [];
  if (r.activeWorkspacePath) candidates.push(r.activeWorkspacePath);
  for (const p of r.recentWorkspacePaths ?? []) candidates.push(p);
  candidates.push(getDefaultWorkspacePath());
  return Array.from(new Set(candidates.map((x) => path.resolve(String(x).trim())).filter(Boolean)));
}

function authProfilesPathUnderOpenclawState(stateRoot: string): string {
  return path.join(stateRoot, 'agents', 'main', 'agent', 'auth-profiles.json');
}

function readAuthProfilesPayload(filePath: string): { version: number; profiles: Record<string, unknown> } | null {
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const j = JSON.parse(raw) as { version?: unknown; profiles?: unknown };
    if (!j || typeof j !== 'object') return null;
    const profiles =
      j.profiles && typeof j.profiles === 'object' && !Array.isArray(j.profiles)
        ? (j.profiles as Record<string, unknown>)
        : {};
    const version = typeof j.version === 'number' ? j.version : 1;
    return { version, profiles };
  } catch {
    return null;
  }
}

function countAuthProfiles(filePath: string): number {
  const p = readAuthProfilesPayload(filePath);
  return p ? Object.keys(p.profiles).length : 0;
}

/**
 * 将历史上保存在「各工作区 `.agent/.clawflow/openclaw`」（或旧版根目录 `.clawflow/openclaw`）下的鉴权合并到全局目录（仅当全局尚无 profile 时执行）。
 * 在创建任意 OpenClaw 引擎之前调用一次即可。
 */
export function migrateWorkspaceOpenclawToGlobalOnce(): void {
  const destRoot = globalOpenclawStateDir();
  fs.mkdirSync(destRoot, { recursive: true });

  const destAuth = authProfilesPathUnderOpenclawState(destRoot);
  if (fs.existsSync(destAuth) && countAuthProfiles(destAuth) > 0) {
    migrateOpenclawJsonIfMissing(destRoot);
    return;
  }

  const uniq = registeredWorkspaceRootCandidates();

  const mergedProfiles: Record<string, unknown> = {};
  let mergedVersion = 1;

  for (const ws of uniq) {
    const srcRoots = [openclawStateDir(ws), path.join(path.resolve(ws), '.clawflow', 'openclaw')];
    for (const srcRoot of srcRoots) {
      const srcAuth = authProfilesPathUnderOpenclawState(srcRoot);
      if (!fs.existsSync(srcAuth)) continue;
      const payload = readAuthProfilesPayload(srcAuth);
      if (!payload || Object.keys(payload.profiles).length === 0) continue;
      Object.assign(mergedProfiles, payload.profiles);
      mergedVersion = payload.version;
    }
  }

  if (Object.keys(mergedProfiles).length > 0) {
    const destAgentDir = path.dirname(destAuth);
    fs.mkdirSync(destAgentDir, { recursive: true });
    fs.writeFileSync(destAuth, JSON.stringify({ version: mergedVersion, profiles: mergedProfiles }, null, 2), 'utf-8');
  }

  migrateOpenclawJsonIfMissing(destRoot, uniq);
}

function migrateOpenclawJsonIfMissing(destRoot: string, workspaceCandidates?: string[]): void {
  const destCfg = path.join(destRoot, 'openclaw.json');
  if (fs.existsSync(destCfg)) return;
  const candidates = workspaceCandidates ?? registeredWorkspaceRootCandidates();
  for (const ws of candidates) {
    const tryPaths = [openclawConfigPath(ws), path.join(path.resolve(ws), '.clawflow', 'openclaw', 'openclaw.json')];
    for (const srcCfg of tryPaths) {
      if (!fs.existsSync(srcCfg)) continue;
      try {
        fs.copyFileSync(srcCfg, destCfg);
      } catch (e) {
        console.warn('[workspace-service] migrate openclaw.json failed:', e);
      }
      return;
    }
  }
}

/**
 * 删除各工作区下历史遗留的 per-workspace `openclaw` 目录（模型鉴权已迁至应用全局目录）。
 * 覆盖 `.agent/.clawflow/openclaw` 与旧版根目录 `.clawflow/openclaw`。
 * 不会删除与用户数据全局目录相同的路径。
 */
export function removeLegacyWorkspaceOpenclawDirs(): void {
  const globalRoot = path.resolve(globalOpenclawStateDir());
  for (const ws of registeredWorkspaceRootCandidates()) {
    const legacies = [
      path.resolve(path.join(clawflowDir(ws), 'openclaw')),
      path.resolve(path.join(ws, '.clawflow', 'openclaw')),
    ];
    const seen = new Set<string>();
    for (const legacy of legacies) {
      if (seen.has(legacy)) continue;
      seen.add(legacy);
      if (legacy === globalRoot || !fs.existsSync(legacy)) continue;
      try {
        fs.rmSync(legacy, { recursive: true, force: true });
      } catch (e) {
        console.warn('[workspace-service] remove legacy workspace openclaw failed:', legacy, e);
      }
    }
  }
}

export function legacyConversationsPath(): string {
  return path.join(app.getPath('userData'), 'cf.conversations.v1.json');
}

export function loadRegistry(): WorkspaceRegistry {
  const p = getRegistryPath();
  try {
    const raw = fs.readFileSync(p, 'utf-8');
    const j = JSON.parse(raw);
    const active =
      typeof j?.activeWorkspacePath === 'string' && j.activeWorkspacePath.trim()
        ? path.resolve(j.activeWorkspacePath.trim())
        : null;
    const rawList: unknown[] = Array.isArray(j?.recentWorkspacePaths) ? j.recentWorkspacePaths : [];
    const recentRaw = rawList.filter((x: unknown): x is string => typeof x === 'string' && Boolean(x.trim()));
    const recent = recentRaw.map((x) => path.resolve(x.trim()));
    let uniq = Array.from(new Set(recent)) as string[];
    const migratedFlag = Boolean(j?.unpinActiveMigrated);

    // 一次性迁移：旧逻辑会把 active 总是放到 recent[0]，导致“切换会置顶”的观感。
    // 这里把 active 从头部移到末尾（仅第一次），之后切换仅更新选中态不改顺序。
    if (!migratedFlag && active && uniq.length > 1 && path.resolve(uniq[0]) === path.resolve(active)) {
      uniq = [...uniq.slice(1), uniq[0]];
    }

    return { activeWorkspacePath: active, recentWorkspacePaths: uniq, unpinActiveMigrated: migratedFlag };
  } catch {
    return { activeWorkspacePath: null, recentWorkspacePaths: [], unpinActiveMigrated: true };
  }
}

export function saveRegistry(reg: WorkspaceRegistry): void {
  const p = getRegistryPath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const payload = JSON.stringify(
    {
      activeWorkspacePath: reg.activeWorkspacePath,
      recentWorkspacePaths: reg.recentWorkspacePaths.slice(0, 12),
      unpinActiveMigrated: reg.unpinActiveMigrated ?? true,
    },
    null,
    2
  );
  fs.writeFileSync(p, payload, 'utf-8');
}

function bumpRecent(reg: WorkspaceRegistry, workspacePath: string): WorkspaceRegistry {
  const abs = path.resolve(workspacePath);
  const list = (reg.recentWorkspacePaths ?? []).map((p) => path.resolve(p));
  const exists = list.some((p) => p === abs);
  // 关键：切换 workspace 不置顶（保持原顺序）。仅当首次出现时追加到末尾。
  const nextRecent = (exists ? list : [...list, abs]).slice(-12);
  return {
    activeWorkspacePath: abs,
    recentWorkspacePaths: nextRecent,
  };
}

/** 一次性：旧版 userData 全局 conversations → 当前 workspace 的 conversations.json */
export function migrateLegacyConversationsOnce(workspaceRoot: string): void {
  const target = conversationsStorePath(workspaceRoot);
  if (fs.existsSync(target)) return;
  const legacy = legacyConversationsPath();
  if (!fs.existsSync(legacy)) return;
  try {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(legacy, target);
    try {
      fs.renameSync(legacy, legacy + '.migrated');
    } catch {
      // ignore
    }
  } catch (e) {
    console.warn('[workspace-service] migrateLegacyConversationsOnce failed:', e);
  }
}

/**
 * 创建当前工作区 `.agent/.clawflow/`、`.subagent/`（含 `.subclawflow/`、`.submemory/`）与 `workspace.json`，并确保应用级全局 OpenClaw 状态目录存在。
 * 同时在**工作区 `.agent/.roleAgent/`** 按需生成 agent 角色模板（AGENTS.md、SOUL.md 等，缺失才写入）。
 */
export async function ensureWorkspaceInitialized(
  workspaceRoot: string,
  opts?: { tools?: WorkspaceToolSelection; gitRemoteUrl?: string | null }
): Promise<WorkspaceMeta> {
  const root = path.resolve(workspaceRoot);
  migrateLegacyWorkspaceAgentBundleSync(root);
  const cf = clawflowDir(root);
  const metaPath = workspaceMetaPath(root);
  const ocDir = globalOpenclawStateDir();

  await fs.promises.mkdir(cf, { recursive: true });
  await fs.promises.mkdir(ocDir, { recursive: true });
  try {
    await fs.promises.mkdir(workspaceAgentDotMemoryDirAbs(root), { recursive: true });
  } catch {
    /* ignore */
  }
  try {
    const { created } = await ensureWorkspaceMainMemoryTemplates(root);
    if (created.length) {
      console.log('[workspace-service] main .memory templates created:', created.join(', '));
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn('[workspace-service] ensureWorkspaceMainMemoryTemplates failed:', msg);
  }
  await ensureSubagentWorkspaceTree(root);

  migrateLegacyConversationsOnce(root);

  await ensureWorkspaceToolBundle(root, opts?.tools !== undefined ? opts.tools : null);

  try {
    const { created } = await ensureWorkspaceAgentRoleTemplates(root);
    if (created.length) {
      console.log('[workspace-service] agent role templates created:', created.join(', '));
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn('[workspace-service] ensureWorkspaceAgentRoleTemplates failed:', msg);
  }

  // 子 Agent 的角色模板，缺失才补写到 `.subagent/.subroleAgent/`
  try {
    const { created } = await ensureWorkspaceSubAgentRoleTemplates(root);
    if (created.length) {
      console.log('[workspace-service] sub-agent role templates created:', created.join(', '));
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn('[workspace-service] ensureWorkspaceSubAgentRoleTemplates failed:', msg);
  }

  // Hermes：`.agent/.skills` 下尚无任何技能时，补写默认示例 `default/SKILL.md`
  try {
    const { created } = await ensureWorkspaceDefaultHermesSkill(root);
    if (created.length) {
      console.log('[workspace-service] default Hermes skill created:', created.join(', '));
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn('[workspace-service] ensureWorkspaceDefaultHermesSkill failed:', msg);
  }

  try {
    await ensureSkillAgentSlotForWorkspace(root);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn('[workspace-service] ensureSkillAgentSlotForWorkspace failed:', msg);
  }

  const now = Date.now();
  let meta: WorkspaceMeta;
  try {
    const buf = await fs.promises.readFile(metaPath, 'utf-8');
    const parsed = JSON.parse(buf);
    const gitFromDisk =
      typeof parsed?.gitRemoteUrl === 'string' && parsed.gitRemoteUrl.trim()
        ? parsed.gitRemoteUrl.trim()
        : undefined;
    meta = {
      id: typeof parsed?.id === 'string' && parsed.id ? parsed.id : randomUUID(),
      name:
        typeof parsed?.name === 'string' && parsed.name.trim()
          ? parsed.name.trim()
          : path.basename(root),
      createdAt: typeof parsed?.createdAt === 'number' ? parsed.createdAt : now,
      lastOpened: now,
      ...(gitFromDisk ? { gitRemoteUrl: gitFromDisk } : {}),
    };
  } catch {
    meta = {
      id: randomUUID(),
      name: path.basename(root),
      createdAt: now,
      lastOpened: now,
    };
  }
  meta.lastOpened = now;
  if (opts?.gitRemoteUrl != null && String(opts.gitRemoteUrl).trim()) {
    meta.gitRemoteUrl = String(opts.gitRemoteUrl).trim();
  }
  await fs.promises.writeFile(metaPath, JSON.stringify(meta, null, 2), 'utf-8');
  return meta;
}

export function setActiveWorkspace(workspacePath: string): WorkspaceRegistry {
  const reg = loadRegistry();
  const next = bumpRecent(reg, workspacePath);
  next.unpinActiveMigrated = true;
  saveRegistry(next);
  return next;
}

export function readWorkspaceMetaSync(workspaceRoot: string): WorkspaceMeta | null {
  try {
    const buf = fs.readFileSync(workspaceMetaPath(workspaceRoot), 'utf-8');
    const parsed = JSON.parse(buf);
    if (!parsed || typeof parsed !== 'object') return null;
    const gitRemoteUrl =
      typeof parsed.gitRemoteUrl === 'string' && parsed.gitRemoteUrl.trim()
        ? parsed.gitRemoteUrl.trim()
        : undefined;
    return {
      id: typeof parsed.id === 'string' ? parsed.id : '',
      name: typeof parsed.name === 'string' ? parsed.name : path.basename(workspaceRoot),
      createdAt: typeof parsed.createdAt === 'number' ? parsed.createdAt : 0,
      lastOpened: typeof parsed.lastOpened === 'number' ? parsed.lastOpened : 0,
      ...(gitRemoteUrl ? { gitRemoteUrl } : {}),
    };
  } catch {
    return null;
  }
}

export async function pickWorkspaceFolder(senderWindow: BrowserWindow | null, dialogTitle?: string): Promise<string | null> {
  const opts: OpenDialogOptions = {
    title: typeof dialogTitle === 'string' && dialogTitle.trim() ? dialogTitle.trim() : '选择工作空间文件夹',
    properties: ['openDirectory', 'createDirectory'],
  };
  const res = senderWindow ? await dialog.showOpenDialog(senderWindow, opts) : await dialog.showOpenDialog(opts);
  if (res.canceled || res.filePaths.length === 0) return null;
  return path.resolve(res.filePaths[0]);
}

/** 路径是否已在注册表（recent 或当前 active） */
export function isWorkspacePathRegistered(workspaceRoot: string): boolean {
  const abs = path.resolve(workspaceRoot);
  return isWorkspaceKnownInRegistry(abs, loadRegistry());
}

/** 侧栏列表：recent 路径 + 每条 workspace.json 中的 gitRemoteUrl */
export function listRecentWorkspaceEntries(): Array<{ path: string; gitRemoteUrl: string | null }> {
  const reg = loadRegistry();
  const paths = (reg.recentWorkspacePaths ?? []).map((p) => path.resolve(p));
  return paths.map((p) => {
    const m = readWorkspaceMetaSync(p);
    const url = m?.gitRemoteUrl?.trim();
    return { path: p, gitRemoteUrl: url || null };
  });
}

export async function resetWorkspaceCacheDirs(
  workspaceRoot: string
): Promise<
  | { ok: true; removed: { agent: boolean; subagent: boolean } }
  | { ok: false; error: string }
> {
  const root = path.resolve(String(workspaceRoot || ''));
  const agentDir = path.join(root, '.agent');
  const subagentDir = path.join(root, '.subagent');
  const removed = { agent: false, subagent: false };
  try {
    try {
      const st = await fs.promises.stat(agentDir);
      if (st.isDirectory()) {
        await fs.promises.rm(agentDir, { recursive: true, force: true });
        removed.agent = true;
      }
    } catch {
      /* missing */
    }
    try {
      const st = await fs.promises.stat(subagentDir);
      if (st.isDirectory()) {
        await fs.promises.rm(subagentDir, { recursive: true, force: true });
        removed.subagent = true;
      }
    } catch {
      /* missing */
    }
    return { ok: true, removed };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}

function isWorkspaceKnownInRegistry(abs: string, reg: WorkspaceRegistry): boolean {
  const recent = (reg.recentWorkspacePaths ?? []).map((p) => path.resolve(p));
  const active = reg.activeWorkspacePath ? path.resolve(reg.activeWorkspacePath) : null;
  return recent.some((p) => isSameWorkspacePath(p, abs)) || (active != null && isSameWorkspacePath(active, abs));
}

/**
 * 从注册表移除路径；若曾为 active 则切到最近一项或默认工作区。
 * 不删除磁盘。
 */
export function detachWorkspaceFromRegistry(workspacePath: string): { newActivePath: string } {
  const abs = path.resolve(workspacePath);
  const def = path.resolve(getDefaultWorkspacePath());
  const reg = loadRegistry();
  if (!isWorkspaceKnownInRegistry(abs, reg)) {
    throw new Error('Workspace is not in registry');
  }

  let recent = (reg.recentWorkspacePaths ?? []).map((p) => path.resolve(p));
  recent = recent.filter((p) => !isSameWorkspacePath(p, abs));

  const curActive = reg.activeWorkspacePath ? path.resolve(reg.activeWorkspacePath) : null;
  const wasActive = curActive != null && isSameWorkspacePath(curActive, abs);

  let newActive: string;
  if (wasActive) {
    newActive = recent.length > 0 ? recent[recent.length - 1] : def;
  } else {
    newActive = curActive ?? def;
  }

  if (!recent.some((p) => isSameWorkspacePath(p, newActive))) {
    recent = [...recent, newActive];
  }
  const uniq = Array.from(new Set(recent)).slice(-12);

  saveRegistry({
    activeWorkspacePath: newActive,
    recentWorkspacePaths: uniq,
    unpinActiveMigrated: true,
  });

  return { newActivePath: newActive };
}

export type RemoveWorkspaceUserResult =
  | { ok: true; newActivePath: string; deletedFromDisk: boolean }
  | { ok: false; error: string };

/**
 * 从最近列表移除；非「默认工作区」时删除工作区下的 `.agent`、`.subagent` 及遗留根目录 `.clawflow`、`.subclawflow`、`.submemory`、`.roleAgent`、`.tool`，不删除用户其余文件。
 */
export async function removeWorkspaceForUser(workspacePath: string): Promise<RemoveWorkspaceUserResult> {
  const abs = path.resolve(workspacePath);
  const def = path.resolve(getDefaultWorkspacePath());
  try {
    const { newActivePath } = detachWorkspaceFromRegistry(abs);
    if (isSameWorkspacePath(abs, def)) {
      return { ok: true, newActivePath, deletedFromDisk: false };
    }
    await removeWorkspaceManagedMetadataDirs(abs);
    return { ok: true, newActivePath, deletedFromDisk: true };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}
