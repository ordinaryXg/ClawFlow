/**
 * Workspace 目录与注册表（主进程）。
 * **`.agent/`** 位于工作区根目录（便于 Git 管理与迁移）；**`.clawflow-launcher-stash/`** 仅在应用缓存 `workspaces/<hash>/`（见 `workspace-blob-store`），不随仓库同步。
 * 主会话元数据在 **`.agent/.clawflow/`**（`clawflowDir()`）。系统级子 Agent 在应用缓存，不占工作区 `.subagent/`。
 */

import { randomUUID } from 'crypto';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { app, BrowserWindow, dialog, OpenDialogOptions } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { ensureWorkspaceAgentRoleTemplates } from './workspace-agent-bootstrap';
import { refreshHermesMemoryIndexBestEffort } from '../../engine/hermes-memory-index-hooks';
import { invalidateHermesMemoryDbCache } from '../../engine/hermes-memory-db';
import { installWorkspaceSkillCreatorPackage } from './workspace-hermes-skill-bootstrap';
import { syncWorkspaceSkillManifest } from './workspace-skill-manifest';
import { ensureWorkspaceMainMemoryTemplates } from './workspace-main-memory-bootstrap';
import { ensureWorkspaceKnowledgeTemplates } from './workspace-knowledge-bootstrap';
import {
  migrateLegacyWorkspaceAgentBundleSync,
  WORKSPACE_AGENT_DIR,
  workspaceAgentDotMemoryDirAbs,
  workspaceAgentRootAbs,
  workspaceSubagentRootAbs,
  workspaceToolDirAbs,
} from './workspace-agent-layout';
import { launcherStashDirAbs, migrateWorkspaceTriadFromLegacyRootsSync, workspaceBlobDirAbs } from './workspace-blob-store';
import { refreshSystemSkillAgentForWorkspace } from '../skill/skill-agent-bootstrap';
import {
  mergeToolSelection,
  WORKSPACE_TOOL_IDS,
  type WorkspaceToolId,
  type WorkspaceToolSelection,
  type WorkspaceToolSelectionInput,
} from '../../shared/workspace-tools';
import {
  buildWorkspaceToolBrowserMd,
  buildWorkspaceToolDocsMd,
  buildWorkspaceToolGitMd,
  buildWorkspaceToolShellMd,
  buildWorkspaceToolKnowledgeBaseMd,
  buildWorkspaceToolSkillsMd,
  buildWorkspaceToolTodosMd,
} from '../../shared/workspace-tool-template-md';

const execFileAsync = promisify(execFile);

export type { WorkspaceToolId, WorkspaceToolSelection } from '../../shared/workspace-tools';

/** 工作区内主会话与调度等元数据（位于 `.agent/` 下） */
export const CLAWFLOW_DIR = '.agent/.clawflow';

/** 待办等「勿随 `.agent` 重置丢失」的工作区根下数据目录（勿使用根目录 `.clawflow/`，会与历史迁移 `migrateLegacyWorkspaceAgentBundleSync` 冲突） */
export const WORKSPACE_TODO_DATA_DIR = '.clawflow-data';

/** @deprecated 工作区委派子 Agent 已移除；重置缓存时仍删除遗留 `.subagent/` */
export const SUBAGENT_ROOT_DIR = '.subagent';

/**
 * 仅从工作区根及缓存 blob 删除 ClawFlow 管理的目录，不删除用户项目文件。
 * 含工作区根 `.agent/`、遗留 `.subagent/`、根下 `.clawflow-launcher-stash/`、blob 内 stash，以及历史遗留根目录等；各目录不存在时忽略。
 */
async function rmPathWithRetry(target: string, attempts = 4): Promise<void> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      await fs.promises.rm(target, { recursive: true, force: true });
      return;
    } catch (e: unknown) {
      lastErr = e;
      const code = e && typeof e === 'object' && 'code' in e ? String((e as { code?: string }).code) : '';
      if (code === 'ENOENT') return;
      if (i < attempts - 1) {
        await new Promise((r) => setTimeout(r, 150 * (i + 1)));
      }
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

async function pathIsExistingDir(p: string): Promise<boolean> {
  try {
    const st = await fs.promises.stat(p);
    return st.isDirectory();
  } catch {
    return false;
  }
}

export async function removeWorkspaceManagedMetadataDirs(workspaceRoot: string): Promise<void> {
  const root = path.resolve(workspaceRoot);
  invalidateHermesMemoryDbCache(root);
  const blob = workspaceBlobDirAbs(workspaceRoot);
  const dirs = [
    path.join(root, WORKSPACE_AGENT_DIR),
    path.join(blob, WORKSPACE_AGENT_DIR),
    path.join(blob, SUBAGENT_ROOT_DIR),
    path.join(root, SUBAGENT_ROOT_DIR),
    blob,
    path.join(root, '.clawflow-launcher-stash'),
    path.join(root, '.clawflow'),
    path.join(root, WORKSPACE_TODO_DATA_DIR),
    path.join(root, '.subclawflow'),
    path.join(root, '.submemory'),
    path.join(root, '.roleAgent'),
    path.join(root, '.tool'),
  ];
  const seen = new Set<string>();
  for (const d of dirs) {
    const key = path.resolve(d).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    try {
      await rmPathWithRetry(d);
    } catch {
      /* 单目录失败不阻断其余；`.agent` 由 removeWorkspaceForUser 终检 */
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
      '- Hermes 技能名册：`skillManifest.json`（名称 / 简介 / 关键字；`tools.skills` 开启时注入主对话）',
      '- 契约说明：`docs.md` / `browser.md` / `git.md` / `shell.md` / `todos.md` / `skills.md` / `knowledge_base.md`',
      '',
    ].join('\n');
    await fs.promises.writeFile(path.join(dir, 'README.md'), readme, 'utf-8');
  } catch {
    /* ignore */
  }

  const docsBody = buildWorkspaceToolDocsMd();
  const browserBody = buildWorkspaceToolBrowserMd();
  const gitBody = buildWorkspaceToolGitMd();
  const shellBody = buildWorkspaceToolShellMd();
  const todosBody = buildWorkspaceToolTodosMd();
  const skillsBody = buildWorkspaceToolSkillsMd();
  const kbBody = buildWorkspaceToolKnowledgeBaseMd();

  await writeIfMissing('docs.md', docsBody.endsWith('\n') ? docsBody : `${docsBody}\n`);
  await writeIfMissing('browser.md', browserBody.endsWith('\n') ? browserBody : `${browserBody}\n`);
  await writeIfMissing('git.md', gitBody.endsWith('\n') ? gitBody : `${gitBody}\n`);
  await writeIfMissing('shell.md', shellBody.endsWith('\n') ? shellBody : `${shellBody}\n`);
  await writeIfMissing('todos.md', todosBody.endsWith('\n') ? todosBody : `${todosBody}\n`);
  await writeIfMissing('skills.md', skillsBody.endsWith('\n') ? skillsBody : `${skillsBody}\n`);
  await writeIfMissing('knowledge_base.md', kbBody.endsWith('\n') ? kbBody : `${kbBody}\n`);
}

const LEGACY_MANIFEST_TOOL_KEYS = new Set<string>([
  ...WORKSPACE_TOOL_IDS,
  'browser', // v1 总开关
  'subagents', // 已移除工作区委派子 Agent
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
  await refreshSystemSkillAgentForWorkspace(workspaceRoot);
  if (tools.skills) {
    await syncWorkspaceSkillManifest(workspaceRoot).catch(() => undefined);
  }
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
  /**
   * 内置「默认工作区」根目录的绝对路径覆盖；未设置时使用 userData/WorkSpace。
   * 用于在系统设置中指定默认工作区落盘位置。
   */
  defaultWorkspaceRootOverride?: string | null;
}

const REGISTRY_FILENAME = 'cf.workspace.v1.json';

export function getRegistryPath(): string {
  return path.join(app.getPath('userData'), REGISTRY_FILENAME);
}

/** 默认 workspace：优先注册表 `defaultWorkspaceRootOverride`，否则为 userData/WorkSpace。 */
export function getDefaultWorkspacePath(): string {
  try {
    const reg = loadRegistry();
    const ov = reg.defaultWorkspaceRootOverride;
    if (typeof ov === 'string' && ov.trim()) {
      return path.resolve(ov.trim());
    }
  } catch {
    /* fall through */
  }
  return path.join(app.getPath('userData'), 'WorkSpace');
}

/** 设置默认工作区根路径（绝对路径）；传 null 或空字符串恢复为 userData/WorkSpace。 */
export function setDefaultWorkspaceRootOverride(resolvedPath: string | null): { ok: true } | { ok: false; error: string } {
  const reg = loadRegistry();
  if (resolvedPath == null || !String(resolvedPath).trim()) {
    const next: WorkspaceRegistry = { ...reg, defaultWorkspaceRootOverride: null };
    saveRegistry(next);
    return { ok: true };
  }
  const abs = path.resolve(String(resolvedPath).trim());
  try {
    fs.mkdirSync(abs, { recursive: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
  saveRegistry({ ...reg, defaultWorkspaceRootOverride: abs });
  return { ok: true };
}

/** 比较两个 workspace 根路径是否相同（Windows 忽略大小写）。 */
export function isSameWorkspacePath(a: string, b: string): boolean {
  const ra = path.resolve(a);
  const rb = path.resolve(b);
  if (process.platform === 'win32') return ra.toLowerCase() === rb.toLowerCase();
  return ra === rb;
}

export function clawflowDir(workspaceRoot: string): string {
  return path.join(workspaceAgentRootAbs(workspaceRoot), '.clawflow');
}

export function workspaceMetaPath(workspaceRoot: string): string {
  return path.join(clawflowDir(workspaceRoot), 'workspace.json');
}

export function conversationsStorePath(workspaceRoot: string): string {
  return path.join(clawflowDir(workspaceRoot), 'conversations.json');
}

/** 待办触发器列表（每工作区一份，落在工作区根 `.clawflow-data/`，不随「重置工作区缓存」删除 `.agent` 而丢失） */
export function todoTriggersStorePath(workspaceRoot: string): string {
  return path.join(path.resolve(workspaceRoot), WORKSPACE_TODO_DATA_DIR, 'todo-triggers.v1.json');
}

/** 旧版路径（`.agent/.clawflow/`）；`readTodoTriggers` 会在新路径无文件时自动迁移 */
export function legacyTodoTriggersStorePath(workspaceRoot: string): string {
  return path.join(clawflowDir(workspaceRoot), 'todo-triggers.v1.json');
}

/** 应用级共享目录（`userData/.clawflow/`）：模型鉴权 `auth-profiles.v*.json` 等，不随工作区切换变化 */
export function globalClawflowRoot(): string {
  return path.join(app.getPath('userData'), CLAWFLOW_DIR);
}

/** 注册表里出现过的 workspace 根路径（活跃、最近、默认），用于迁移与清理。 */
export function registeredWorkspaceRootCandidates(reg?: WorkspaceRegistry): string[] {
  const r = reg ?? loadRegistry();
  const candidates: string[] = [];
  if (r.activeWorkspacePath) candidates.push(r.activeWorkspacePath);
  for (const p of r.recentWorkspacePaths ?? []) candidates.push(p);
  return Array.from(new Set(candidates.map((x) => path.resolve(String(x).trim())).filter(Boolean)));
}

/**
 * 删除磁盘上仍存在的旧版子目录名 `openclaw`（历史布局残留），位于工作区或用户数据 `.clawflow/` 下。
 */
export function removeLegacyExternalAgentStateDirsSync(): void {
  const targets = new Set<string>();
  targets.add(path.resolve(path.join(globalClawflowRoot(), 'openclaw')));
  for (const ws of registeredWorkspaceRootCandidates()) {
    targets.add(path.resolve(path.join(clawflowDir(ws), 'openclaw')));
    targets.add(path.resolve(path.join(ws, '.clawflow', 'openclaw')));
  }
  for (const dir of targets) {
    if (!fs.existsSync(dir)) continue;
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch (e) {
      console.warn('[workspace-service] remove legacy external-agent dir failed:', dir, e);
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
    return parseWorkspaceRegistryJson(raw, p);
  } catch {
    return { activeWorkspacePath: null, recentWorkspacePaths: [], unpinActiveMigrated: true };
  }
}

function parseWorkspaceRegistryJson(raw: string, _sourcePathForLog?: string): WorkspaceRegistry {
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

  if (!migratedFlag && active && uniq.length > 1 && path.resolve(uniq[0]) === path.resolve(active)) {
    uniq = [...uniq.slice(1), uniq[0]];
  }

  const ovRaw = j?.defaultWorkspaceRootOverride;
  const defaultWorkspaceRootOverride =
    typeof ovRaw === 'string' && ovRaw.trim() ? path.resolve(ovRaw.trim()) : null;

  return {
    activeWorkspacePath: active,
    recentWorkspacePaths: uniq,
    unpinActiveMigrated: migratedFlag,
    defaultWorkspaceRootOverride,
  };
}

function registryHasPaths(reg: WorkspaceRegistry): boolean {
  return (
    (reg.recentWorkspacePaths?.length ?? 0) > 0 ||
    (reg.activeWorkspacePath != null && String(reg.activeWorkspacePath).trim() !== '')
  );
}

function mergeWorkspaceRegistries(a: WorkspaceRegistry, b: WorkspaceRegistry): WorkspaceRegistry {
  const key = (p: string) => (process.platform === 'win32' ? path.resolve(p).toLowerCase() : path.resolve(p));
  const seen = new Set<string>();
  const recent: string[] = [];
  const add = (p: string) => {
    const k = key(p);
    if (seen.has(k)) return;
    seen.add(k);
    recent.push(path.resolve(p));
  };
  for (const p of a.recentWorkspacePaths ?? []) add(p);
  for (const p of b.recentWorkspacePaths ?? []) add(p);
  const activeRaw = a.activeWorkspacePath ?? b.activeWorkspacePath;
  const active = activeRaw && String(activeRaw).trim() ? path.resolve(String(activeRaw).trim()) : null;
  if (active) add(active);
  const uniq = recent.slice(-12);
  return {
    activeWorkspacePath: active,
    recentWorkspacePaths: uniq,
    unpinActiveMigrated: a.unpinActiveMigrated ?? b.unpinActiveMigrated ?? true,
    ...(a.defaultWorkspaceRootOverride != null
      ? { defaultWorkspaceRootOverride: a.defaultWorkspaceRootOverride }
      : b.defaultWorkspaceRootOverride != null
        ? { defaultWorkspaceRootOverride: b.defaultWorkspaceRootOverride }
        : {}),
  };
}

/**
 * 若当前 `cf.workspace.v1.json` 为空（例如应用名从 ClawFlow 变为 claw-flow 后 userData 目录变了），
 * 尝试从 `%APPDATA%\ClawFlow` / `%APPDATA%\claw-flow` 读取同名注册表并合并写回当前 userData。
 */
export function migrateLegacyWorkspaceRegistryIfEmptySync(): void {
  const curPath = getRegistryPath();
  let cur: WorkspaceRegistry;
  try {
    const raw = fs.readFileSync(curPath, 'utf-8');
    cur = parseWorkspaceRegistryJson(raw, curPath);
  } catch {
    cur = { activeWorkspacePath: null, recentWorkspacePaths: [], unpinActiveMigrated: true };
  }
  if (registryHasPaths(cur)) return;

  const altPaths: string[] = [];
  if (process.platform === 'win32' && process.env.APPDATA) {
    const ap = process.env.APPDATA;
    altPaths.push(path.join(ap, 'ClawFlow', REGISTRY_FILENAME));
    altPaths.push(path.join(ap, 'claw-flow', REGISTRY_FILENAME));
  }

  let merged: WorkspaceRegistry | null = null;
  for (const alt of altPaths) {
    if (path.normalize(alt) === path.normalize(curPath)) continue;
    if (!fs.existsSync(alt)) continue;
    try {
      const raw = fs.readFileSync(alt, 'utf-8');
      const r = parseWorkspaceRegistryJson(raw, alt);
      if (!registryHasPaths(r)) continue;
      merged = merged == null ? mergeWorkspaceRegistries(cur, r) : mergeWorkspaceRegistries(merged, r);
    } catch {
      /* ignore */
    }
  }
  if (merged != null && registryHasPaths(merged)) {
    saveRegistry(merged);
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
      ...(reg.defaultWorkspaceRootOverride != null && String(reg.defaultWorkspaceRootOverride).trim()
        ? { defaultWorkspaceRootOverride: path.resolve(String(reg.defaultWorkspaceRootOverride).trim()) }
        : {}),
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
    ...reg,
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

/** 工作区根下已有 `.agent/` 时视为既有布局，跳过模板补写。 */
export async function workspaceHasExistingAgentAndSubagent(workspaceRoot: string): Promise<boolean> {
  const root = path.resolve(String(workspaceRoot ?? '').trim());
  if (!root) return false;
  try {
    const st = await fs.promises.stat(workspaceAgentRootAbs(root));
    return st.isDirectory();
  } catch {
    return false;
  }
}

function readOriginUrlFromDotGitConfig(workspaceRoot: string): string | null {
  const cfg = path.join(path.resolve(workspaceRoot), '.git', 'config');
  try {
    if (!fs.existsSync(cfg)) return null;
    const st = fs.statSync(cfg);
    if (!st.isFile()) return null;
    const text = fs.readFileSync(cfg, 'utf8');
    const lines = text.split(/\r?\n/);
    let inOrigin = false;
    for (const line of lines) {
      if (/^\s*\[remote\s+"origin"\]\s*$/i.test(line)) {
        inOrigin = true;
        continue;
      }
      if (/^\s*\[/.test(line)) inOrigin = false;
      if (inOrigin) {
        const m = line.match(/^\s*url\s*=\s*(.+)\s*$/i);
        if (m) return m[1].trim().replace(/^["']|["']$/g, '');
      }
    }
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * 若存在 `.git`（普通仓或 worktree 的 gitdir 链接），尝试读取 `remote.origin.url`，写入 workspace 元数据以识别 Git 工作区。
 */
export async function readGitOriginRemoteBestEffort(workspaceRoot: string): Promise<string | null> {
  const root = path.resolve(String(workspaceRoot ?? '').trim());
  if (!root) return null;
  try {
    await fs.promises.access(path.join(root, '.git'));
  } catch {
    return null;
  }
  try {
    const { stdout } = await execFileAsync('git', ['config', '--get', 'remote.origin.url'], {
      cwd: root,
      windowsHide: true,
      maxBuffer: 512 * 1024,
      encoding: 'utf8',
    });
    const u = String(stdout ?? '')
      .split(/\r?\n/)[0]
      .trim();
    if (u) return u;
  } catch {
    /* fall through */
  }
  return readOriginUrlFromDotGitConfig(root);
}

/**
 * 创建工作区根下 **`.agent/.clawflow/`** 与 `workspace.json`；在 **`.agent/.roleAgent/`** 按需生成角色模板。
 * 若工作区根下已有 `.agent/`，则视为既有工作区：跳过历史迁移与模板补写，仅更新元数据与工具清单。
 * 打开时会迁移 stash，并清理遗留 **`.subagent/`** 与工作区委派名册（系统子 Agent 在应用缓存）。
 */
export async function ensureWorkspaceInitialized(
  workspaceRoot: string,
  opts?: { tools?: WorkspaceToolSelection; gitRemoteUrl?: string | null }
): Promise<WorkspaceMeta> {
  const root = path.resolve(workspaceRoot);
  migrateWorkspaceTriadFromLegacyRootsSync(root);
  const preserveExistingLayout = await workspaceHasExistingAgentAndSubagent(root);
  if (!preserveExistingLayout) {
    migrateLegacyWorkspaceAgentBundleSync(root);
  }
  const { pruneLegacyWorkspaceSubagentArtifactsSync } = await import('./workspace-legacy-subagent-cleanup');
  pruneLegacyWorkspaceSubagentArtifactsSync(root);
  const cf = clawflowDir(root);
  const metaPath = workspaceMetaPath(root);

  await fs.promises.mkdir(cf, { recursive: true });
  try {
    await fs.promises.mkdir(workspaceAgentDotMemoryDirAbs(root), { recursive: true });
  } catch {
    /* ignore */
  }
  migrateLegacyConversationsOnce(root);

  await ensureWorkspaceToolBundle(root, opts?.tools !== undefined ? opts.tools : null);

  // 缺失则补写（wx，不覆盖）；勿因已有 `.agent/` 而跳过 `.roleAgent` 模板
  try {
    await ensureWorkspaceMainMemoryTemplates(root);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn('[workspace-service] ensureWorkspaceMainMemoryTemplates failed:', msg);
  }
  try {
    await ensureWorkspaceKnowledgeTemplates(root);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn('[workspace-service] ensureWorkspaceKnowledgeTemplates failed:', msg);
  }
  try {
    await ensureWorkspaceAgentRoleTemplates(root);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn('[workspace-service] ensureWorkspaceAgentRoleTemplates failed:', msg);
  }

  try {
    await refreshSystemSkillAgentForWorkspace(root);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn('[workspace-service] refreshSystemSkillAgentForWorkspace failed:', msg);
  }

  // 新建工作区（尚无 `.agent/`）：安装 skill-creator v2 整包；既有工作区不补写（无 v1 增量逻辑）
  if (!preserveExistingLayout) {
    try {
      await installWorkspaceSkillCreatorPackage(root);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn('[workspace-service] installWorkspaceSkillCreatorPackage failed:', msg);
    }
  }

  try {
    refreshHermesMemoryIndexBestEffort(root);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn('[workspace-service] Hermes FTS sync failed:', msg);
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
  const optGit = opts?.gitRemoteUrl != null && String(opts.gitRemoteUrl).trim() ? String(opts.gitRemoteUrl).trim() : '';
  if (optGit) {
    meta.gitRemoteUrl = optGit;
  } else {
    const cur = (meta.gitRemoteUrl ?? '').trim();
    if (!cur) {
      const detected = await readGitOriginRemoteBestEffort(root);
      if (detected) meta.gitRemoteUrl = detected;
    }
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
  invalidateHermesMemoryDbCache(root);
  const agentDir = workspaceAgentRootAbs(root);
  const subagentDir = workspaceSubagentRootAbs(root);
  const stashDir = launcherStashDirAbs(root);
  const legacyStashAtRoot = path.join(root, '.clawflow-launcher-stash');
  const removed = { agent: false, subagent: false };
  try {
    const tryRm = async (p: string) => {
      try {
        const st = await fs.promises.stat(p);
        if (st.isDirectory()) {
          await rmPathWithRetry(p);
          return true;
        }
      } catch {
        /* missing */
      }
      return false;
    };
    if (await tryRm(agentDir)) removed.agent = true;
    if (await tryRm(subagentDir)) removed.subagent = true;
    await tryRm(stashDir);
    await tryRm(legacyStashAtRoot);
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
export function detachWorkspaceFromRegistry(workspacePath: string): { newActivePath: string | null } {
  const abs = path.resolve(workspacePath);
  const reg = loadRegistry();
  if (!isWorkspaceKnownInRegistry(abs, reg)) {
    throw new Error('Workspace is not in registry');
  }

  let recent = (reg.recentWorkspacePaths ?? []).map((p) => path.resolve(p));
  recent = recent.filter((p) => !isSameWorkspacePath(p, abs));

  const curActive = reg.activeWorkspacePath ? path.resolve(reg.activeWorkspacePath) : null;
  const wasActive = curActive != null && isSameWorkspacePath(curActive, abs);

  let newActive: string | null;
  if (wasActive) {
    newActive = recent.length > 0 ? recent[recent.length - 1] : null;
  } else {
    newActive = curActive;
  }

  if (newActive && !recent.some((p) => isSameWorkspacePath(p, newActive!))) {
    recent = [...recent, newActive];
  }
  const uniq = Array.from(new Set(recent)).slice(-12);

  saveRegistry({
    ...reg,
    activeWorkspacePath: newActive,
    recentWorkspacePaths: uniq,
    unpinActiveMigrated: true,
  });

  return { newActivePath: newActive };
}

export type RemoveWorkspaceUserResult =
  | { ok: true; newActivePath: string | null; deletedFromDisk: boolean }
  | { ok: false; error: string };

/**
 * 从最近列表移除，并删除该路径下 ClawFlow 托管目录（`.agent`、遗留 `.subagent` 等），不删除用户其余项目文件。
 */
export async function removeWorkspaceForUser(workspacePath: string): Promise<RemoveWorkspaceUserResult> {
  const abs = path.resolve(workspacePath);
  if (!isWorkspaceKnownInRegistry(abs, loadRegistry())) {
    return { ok: false, error: 'Workspace is not in registry' };
  }
  try {
    await removeWorkspaceManagedMetadataDirs(abs);
    const agentDir = workspaceAgentRootAbs(abs);
    if (await pathIsExistingDir(agentDir)) {
      return {
        ok: false,
        error:
          '无法删除 `.agent/`（文件可能被占用）。请关闭使用该工作区的窗口后重试。',
      };
    }
    const { newActivePath } = detachWorkspaceFromRegistry(abs);
    return { ok: true, newActivePath, deletedFromDisk: true };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}
