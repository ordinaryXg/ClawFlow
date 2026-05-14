import { ExecException, exec, spawn, ChildProcess } from 'child_process';
import { app, ipcMain, dialog, BrowserWindow, OpenDialogOptions } from 'electron';
import { promisify } from 'util';
import EventEmitter from 'events';
import * as path from 'path';
import * as fs from 'fs';
import {
  conversationsStorePath,
  getDefaultWorkspacePath,
  globalOpenclawConfigPath,
  globalOpenclawStateDir,
} from '../main/workspace/workspace-service';
import { removeAuthProfile as removeBuiltinAuthProfile, upsertAuthProfile } from './auth-store';

const execAsync = promisify(exec);

/**
 * OpenClaw 引擎配置接口
 */
export interface OpenClawEngineConfig {
  /** OpenClaw CLI 可执行文件路径（默认：'openclaw'，从 PATH 查找） */
  cliPath?: string;
  /** 命令执行超时时间（毫秒，默认：30000） */
  commandTimeout?: number;
  /** Gateway 启动确认超时时间（毫秒，默认：5000） */
  gatewayStartTimeout?: number;
  /** 是否启用详细日志（默认：false） */
  verbose?: boolean;
  /** 工作空间根目录（其下包含 `.agent/`、`.subagent/` 等） */
  workspaceRoot?: string;
}

/**
 * OpenClaw 引擎事件
 */
export interface OpenClawEngineEvents {
  'gateway:starting': [];
  'gateway:started': [];
  'gateway:stopping': [];
  'gateway:stopped': [];
  'gateway:error': [error: Error];
  'command:executed': [command: string, args: string[]];
  'command:error': [command: string, args: string[], error: Error];
}

/**
 * OpenClaw 引擎接口定义
 */
export interface OpenClawEngine {
  /** 获取 OpenClaw 版本 */
  getVersion(): Promise<string>;
  /** 获取 Gateway 状态 */
  getGatewayStatus(): Promise<'running' | 'stopped' | 'unknown'>;
  /** 启动 Gateway */
  startGateway(): Promise<void>;
  /** 停止 Gateway */
  stopGateway(): Promise<void>;
  /** 获取当前配置 */
  getConfig(): Readonly<OpenClawEngineConfig>;
  /** 更新配置 */
  updateConfig(config: Partial<OpenClawEngineConfig>): void;
  /** 验证 CLI 是否可用 */
  validateCLI(): Promise<boolean>;
}

/**
 * OpenClaw 引擎事件发射器接口
 */
export interface OpenClawEngineEventEmitter {
  on<K extends keyof OpenClawEngineEvents>(
    event: K,
    listener: (...args: OpenClawEngineEvents[K]) => void
  ): this;
  emit<K extends keyof OpenClawEngineEvents>(
    event: K,
    ...args: OpenClawEngineEvents[K]
  ): boolean;
}

/**
 * OpenClaw CLI 执行结果
 */
interface CLIExecutionResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
}

type JsonValue = null | boolean | number | string | JsonValue[] | { [k: string]: JsonValue };

type ConversationMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
};

type ConversationRecord = {
  id: string;
  title: string;
  messages: ConversationMessage[];
  createdAt: number;
  updatedAt: number;
};

/**
 * 解析 OpenClaw CLI 路径
 * 仅使用系统 PATH（本项目不再内置 OpenClaw CLI）
 */
function resolveOpenClawPath(): string {
  return 'openclaw';
}

/**
 * OpenClaw 引擎实现类
 */
class OpenClawEngineImpl extends EventEmitter implements OpenClawEngine, OpenClawEngineEventEmitter {
  private config: Required<Omit<OpenClawEngineConfig, 'workspaceRoot'>> & { workspaceRoot: string };
  private isStarting = false;
  private isStopping = false;
  private gatewayProcess: ChildProcess | null = null;
  private readonly workspaceRoot: string;
  private readonly openclawStateDir: string;
  private readonly openclawConfigFile: string;
  private readonly conversationStorePath: string;

  constructor(config: OpenClawEngineConfig = {}) {
    super();

    const resolvedCliPath = config.cliPath ?? resolveOpenClawPath();
    const workspaceRoot = path.resolve(config.workspaceRoot ?? getDefaultWorkspacePath());

    this.workspaceRoot = workspaceRoot;
    this.openclawStateDir = globalOpenclawStateDir();
    this.openclawConfigFile = globalOpenclawConfigPath();
    this.conversationStorePath = conversationsStorePath(workspaceRoot);

    this.config = {
      cliPath: resolvedCliPath,
      commandTimeout: config.commandTimeout ?? 60000,
      gatewayStartTimeout: config.gatewayStartTimeout ?? 30000,
      verbose: config.verbose ?? false,
      workspaceRoot,
    };

    this.log('OpenClawEngine 初始化完成');
    this.log('  Workspace:', this.workspaceRoot);
    this.log('  OPENCLAW_STATE_DIR (global):', this.openclawStateDir);
    this.log('  CLI 路径:', this.config.cliPath);
    this.log('  命令超时:', this.config.commandTimeout, 'ms');
    this.log('  Gateway 启动超时:', this.config.gatewayStartTimeout, 'ms');
  }

  /** OpenClaw CLI 子进程环境：状态与配置使用应用级全局目录（各工作区共用） */
  private getClawEnv(): NodeJS.ProcessEnv {
    return {
      ...process.env,
      OPENCLAW_STATE_DIR: this.openclawStateDir,
      OPENCLAW_CONFIG_PATH: this.openclawConfigFile,
    };
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<OpenClawEngineConfig>): void {
    const next = { ...config };
    delete (next as Partial<OpenClawEngineConfig>).workspaceRoot;
    this.config = {
      ...this.config,
      ...next,
    };
    this.log('配置已更新:', this.config);
  }

  /**
   * 获取当前配置（只读）
   */
  getConfig(): Readonly<OpenClawEngineConfig> {
    return { ...this.config };
  }

  /**
   * 内部日志方法
   */
  private log(...args: any[]): void {
    if (this.config.verbose) {
      try {
        // 在某些窗口/管道关闭场景下，console.log 可能抛出 EPIPE（broken pipe）。
        // 日志不应导致主进程崩溃，因此这里做 best-effort 吞掉写入失败。
        // eslint-disable-next-line no-console
        console.log('[OpenClawEngine]', ...args);
      } catch {
        /* ignore */
      }
    }
  }

  /**
   * 内部错误日志方法
   */
  private logError(...args: any[]): void {
    try {
      // eslint-disable-next-line no-console
      console.error('[OpenClawEngine]', ...args);
    } catch {
      /* ignore */
    }
  }

  private async readConversations(): Promise<ConversationRecord[]> {
    try {
      const buf = await fs.promises.readFile(this.conversationStorePath);
      const raw = JSON.parse(buf.toString('utf-8'));
      const arr = Array.isArray(raw) ? raw : Array.isArray(raw?.conversations) ? raw.conversations : [];
      return (arr as ConversationRecord[]).filter((c) => c && typeof c.id === 'string');
    } catch {
      return [];
    }
  }

  private async writeConversations(conversations: ConversationRecord[]): Promise<void> {
    await fs.promises.mkdir(path.dirname(this.conversationStorePath), { recursive: true });
    const payload = JSON.stringify({ conversations }, null, 2);
    await fs.promises.writeFile(this.conversationStorePath, payload, 'utf-8');
  }

  async listConversations(): Promise<ConversationRecord[]> {
    return await this.readConversations();
  }

  async upsertConversation(conversation: ConversationRecord): Promise<void> {
    const list = await this.readConversations();
    const next = list.some((c) => c.id === conversation.id)
      ? list.map((c) => (c.id === conversation.id ? conversation : c))
      : [...list, conversation];
    await this.writeConversations(next);
  }

  async removeConversation(id: string): Promise<void> {
    const list = await this.readConversations();
    const next = list.filter((c) => c.id !== id);
    await this.writeConversations(next);
  }

  /**
   * 获取可用于 exec 的完整命令前缀
   * 处理 .mjs 文件需要用 node/electron 运行的问题
   * 生产环境中使用打包进去的 resources/node.exe
   */
  private getCommandPrefix(): string {
    const cliPath = this.config.cliPath;

    if (cliPath.endsWith('.mjs') || cliPath.endsWith('.mjs')) {
      // 生产环境：使用打包进去的 node.exe
      if (app.isPackaged) {
        const nodeExe = path.join(process.resourcesPath, 'node.exe');
        return `"${nodeExe}" --experimental-vm-modules "${cliPath}"`;
      }
      // 开发环境：依赖系统 PATH 中的 node
      return `node --experimental-vm-modules "${cliPath}"`;
    }

    return `"${cliPath}"`;
  }

  /**
   * 执行 OpenClaw CLI 命令
   */
  private async executeCommand(
    args: string[],
    options: { timeout?: number; checkExitCode?: boolean } = {}
  ): Promise<CLIExecutionResult> {
    const { timeout = this.config.commandTimeout, checkExitCode = false } = options;
    const command = this.config.cliPath;
    const commandPrefix = this.getCommandPrefix();
    const fullCommand = `${commandPrefix} ${args.join(' ')}`;

    this.log('========================================');
    this.log('执行命令:', fullCommand);
    this.log('  超时时间:', timeout, 'ms');
    this.log('  检查退出码:', checkExitCode);
    this.log('========================================');

    try {
      const { stdout, stderr } = await execAsync(fullCommand, {
        timeout,
        windowsHide: true,
        encoding: 'utf8',
        env: this.getClawEnv(),
        // 避免依赖 Electron 主进程 cwd；部分 OpenClaw 子命令会探测当前目录下的项目配置
        cwd: this.openclawStateDir,
      });

      const trimForLog = (s: string, max = 4000) => {
        const text = String(s ?? '');
        if (text.length <= max) return text;
        return `${text.slice(0, max)}\n... (truncated ${text.length - max} chars) ...`;
      };

      this.log('命令执行成功');
      this.log('  stdout:', trimForLog(stdout));
      this.log('  stderr:', trimForLog(stderr));
      
      this.emit('command:executed', command, args);

      return {
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        exitCode: 0,
      };
    } catch (error: any) {
      const execError = error as ExecException & { stdout?: string; stderr?: string; code?: number };
      
      this.logError('========================================');
      this.logError('命令执行失败:', fullCommand);
      this.logError('  错误信息:', execError.message);
      this.logError('  错误代码:', execError.code);
      this.logError('  stdout:', execError.stdout);
      this.logError('  stderr:', execError.stderr);
      this.logError('========================================');
      
      this.emit('command:error', command, args, execError);

      // 如果不检查退出码，则视为成功（某些命令退出码非0但仍有输出）
      if (!checkExitCode) {
        this.log('  不检查退出码，视为成功');
        return {
          stdout: (execError.stdout ?? '').trim(),
          stderr: (execError.stderr ?? '').trim(),
          exitCode: execError.code ?? null,
        };
      }

      throw execError;
    }
  }

  async pasteModelAuthToken(params: { agentId?: string; provider: string; token: string; profileId?: string; label?: string }): Promise<void> {
    const agentId = params.agentId ?? 'main';
    const provider = params.provider.trim();
    const token = params.token;
    const profileId = (params.profileId ?? `${provider}:manual`).trim();
    const label = typeof params.label === 'string' ? params.label.trim() : '';

    if (!provider) throw new Error('Missing provider');
    if (!token) throw new Error('Missing token');

    // Built-in chat engine reads `auth-profiles.v1.json` first; do this before OpenClaw file writes
    // so keys work even if agent dir / openclaw.json updates fail.
    await upsertAuthProfile({
      provider,
      token,
      profileId,
      ...(label ? { label } : {}),
    });

    // Avoid running interactive OpenClaw helpers inside Electron (no TTY on Windows),
    // write directly to OpenClaw auth store + config instead.
    const stateRoot = this.openclawStateDir;
    const agentDir = path.join(stateRoot, 'agents', agentId, 'agent');
    const authProfilesPath = path.join(agentDir, 'auth-profiles.json');
    const openclawConfigPath = this.openclawConfigFile;

    await fs.promises.mkdir(agentDir, { recursive: true });

    // 1) Update per-agent auth-profiles.json (stores the actual token)
    let authProfiles: any = { version: 1, profiles: {} };
    try {
      const raw = await fs.promises.readFile(authProfilesPath, 'utf-8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') authProfiles = parsed;
    } catch {
      // ignore missing/invalid
    }
    if (!authProfiles.profiles || typeof authProfiles.profiles !== 'object') authProfiles.profiles = {};
    authProfiles.version = typeof authProfiles.version === 'number' ? authProfiles.version : 1;
    authProfiles.profiles[profileId] = { type: 'token', provider, token, ...(label ? { label } : {}) };
    await fs.promises.writeFile(authProfilesPath, JSON.stringify(authProfiles, null, 2), 'utf-8');

    // 2) Update ~/.openclaw/openclaw.json to reference the profile (no token stored here)
    try {
      const raw = await fs.promises.readFile(openclawConfigPath, 'utf-8');
      const cfg = JSON.parse(raw);
      const next = cfg && typeof cfg === 'object' ? cfg : {};
      if (!next.auth || typeof next.auth !== 'object') next.auth = {};
      if (!next.auth.profiles || typeof next.auth.profiles !== 'object') next.auth.profiles = {};
      next.auth.profiles[profileId] = { provider, mode: 'token' };
      await fs.promises.writeFile(openclawConfigPath, JSON.stringify(next, null, 2), 'utf-8');
    } catch {
      // if config missing, do nothing (OpenClaw can regenerate via onboard/configure)
    }
  }

  async removeModelAuthToken(params: { agentId?: string; provider: string; profileId?: string }): Promise<{ removed: boolean }> {
    const agentId = params.agentId ?? 'main';
    const provider = params.provider.trim();
    const profileId = (params.profileId ?? `${provider}:manual`).trim();

    if (!provider) throw new Error('Missing provider');
    if (!profileId) throw new Error('Missing profile id');

    const stateRoot = this.openclawStateDir;
    const agentDir = path.join(stateRoot, 'agents', agentId, 'agent');
    const authProfilesPath = path.join(agentDir, 'auth-profiles.json');
    const openclawConfigPath = this.openclawConfigFile;

    let removed = false;

    // 1) Remove token from per-agent auth-profiles.json
    try {
      const raw = await fs.promises.readFile(authProfilesPath, 'utf-8');
      const parsed: any = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && parsed.profiles && typeof parsed.profiles === 'object') {
        if (profileId in parsed.profiles) {
          delete parsed.profiles[profileId];
          removed = true;
          await fs.promises.writeFile(authProfilesPath, JSON.stringify(parsed, null, 2), 'utf-8');
        }
      }
    } catch {
      // ignore missing/invalid
    }

    // 2) Remove reference from openclaw.json (best effort)
    try {
      const raw = await fs.promises.readFile(openclawConfigPath, 'utf-8');
      const cfg: any = JSON.parse(raw);
      if (cfg && typeof cfg === 'object' && cfg.auth && typeof cfg.auth === 'object' && cfg.auth.profiles && typeof cfg.auth.profiles === 'object') {
        if (profileId in cfg.auth.profiles) {
          delete cfg.auth.profiles[profileId];
          await fs.promises.writeFile(openclawConfigPath, JSON.stringify(cfg, null, 2), 'utf-8');
        }
      }
    } catch {
      // ignore missing/invalid
    }

    try {
      await removeBuiltinAuthProfile({ provider, profileId });
    } catch (e) {
      console.warn('[OpenClawEngine] remove builtin auth-store profile failed:', e instanceof Error ? e.message : e);
    }

    return { removed };
  }

  async setDefaultModel(params: { agentId?: string; modelId: string }): Promise<void> {
    const modelId = params.modelId.trim();
    if (!modelId) throw new Error('Missing model id');

    // `openclaw models set` is global (no --agent flag).
    await this.executeCommand(['models', 'set', JSON.stringify(modelId)], { checkExitCode: true });
  }

  /**
   * 从 OpenClaw 配置中弱化/移除此列表项：
   * - 若为当前默认模型，先切到列表中另一条（避免悬空默认）。
   * - 依次尝试 `models fallbacks remove`、`models aliases remove`（与 upstream CLI 子命令对齐）。
   * - 再按模型 id 前缀做提供方层面的手动 Token 清理（可能与「缺少 Key」行一致）。
   */
  async removeListedModelEntry(params: {
    modelId: string;
    profileId?: string;
  }): Promise<{ cliRemoved: boolean; defaultSwitched: boolean }> {
    const modelId = params.modelId.trim();
    if (!modelId) throw new Error('Missing model id');

    const summary = await this.getModelsSummary();
    let defaultSwitched = false;
    if (summary.defaultModelId === modelId) {
      const others = summary.models.map((m) => m.id).filter((id) => id && id !== modelId);
      if (others.length === 0) {
        throw new Error('MODEL_REMOVE_BLOCKED_ONLY_LISTED_MODEL');
      }
      await this.setDefaultModel({ modelId: others[0] });
      defaultSwitched = true;
    }

    const quoted = JSON.stringify(modelId);
    const tail = modelId.includes('/') ? modelId.slice(modelId.indexOf('/') + 1).trim() : modelId;

    const attempts: string[][] = [
      ['models', 'fallbacks', 'remove', quoted],
      ['models', 'aliases', 'remove', quoted],
    ];
    if (tail && tail !== modelId) {
      attempts.push(['models', 'aliases', 'remove', JSON.stringify(tail)]);
    }

    let cliRemoved = false;
    for (const args of attempts) {
      try {
        await this.executeCommand(args, { checkExitCode: true });
        cliRemoved = true;
      } catch {
        /* next */
      }
    }

    const provider = modelId.split('/')[0]?.trim();
    if (provider) {
      const profileIdRaw = typeof params.profileId === 'string' ? params.profileId.trim() : '';
      const resolvedProfileId = profileIdRaw || `${provider}:manual`;
      try {
        await this.removeModelAuthToken({ provider, profileId: resolvedProfileId });
      } catch {
        /* best-effort */
      }
    }

    return { cliRemoved, defaultSwitched };
  }

  private extractJsonPayload(text: string): string | null {
    const s = String(text ?? '').trim();
    if (!s) return null;
    if (s.startsWith('{') || s.startsWith('[')) return s;
    const idxObj = s.indexOf('{');
    const idxArr = s.indexOf('[');
    const idx = idxObj === -1 ? idxArr : idxArr === -1 ? idxObj : Math.min(idxObj, idxArr);
    if (idx === -1) return null;
    return s.slice(idx).trim();
  }

  private parseJson(text: string): JsonValue | null {
    const payload = this.extractJsonPayload(text);
    if (!payload) return null;
    try {
      return JSON.parse(payload) as JsonValue;
    } catch (e) {
      this.logError('[OpenClawEngine] JSON 解析失败:', e);
      return null;
    }
  }

  private async runJsonCommand(args: string[]): Promise<JsonValue> {
    const res = await this.executeCommand(args, { checkExitCode: true });
    const parsed = this.parseJson(res.stdout);
    if (parsed === null) {
      throw new Error(`命令未返回可解析 JSON：openclaw ${args.join(' ')}`);
    }
    return parsed;
  }

  async runAgentMessage(message: string, sessionId?: string, modelId?: string): Promise<string> {
    const args = ['agent', '--local', '--json', '--agent', 'main'];
    if (sessionId) {
      args.push('--session-id', JSON.stringify(sessionId));
    }
    if (modelId && modelId.trim()) {
      args.push('--model', JSON.stringify(modelId.trim()));
    }
    args.push('--message', JSON.stringify(message));

    const json = await this.runJsonCommand(args);
    const obj: any = json;
    const candidates = [
      obj?.payloads?.[0]?.text,
      obj?.payloads?.[0]?.content,
      obj?.reply?.text,
      obj?.reply?.message,
      obj?.message,
      obj?.text,
      obj?.output?.text,
      obj?.result?.text,
    ];
    for (const c of candidates) {
      if (typeof c === 'string' && c.trim()) return c.trim();
    }
    return JSON.stringify(json);
  }

  async getModelsSummary(): Promise<{
    defaultModelId: string | null;
    models: Array<{ id: string; name?: string; available?: boolean; tags?: string[] }>;
    configuredProviders: string[];
    providerProfiles: Record<string, { profileId: string; label?: string }>;
  }> {
    const status = await this.runJsonCommand(['models', 'status', '--json']).catch(() => null);
    const list = await this.runJsonCommand(['models', 'list', '--json']).catch(() => null);

    const defaultModelId =
      typeof (status as any)?.defaultModel === 'string' && (status as any).defaultModel
        ? String((status as any).defaultModel)
        : null;

    const modelsRaw: any[] = Array.isArray((list as any)?.models) ? (list as any).models : [];
    const models = modelsRaw
      .map((m) => {
        const id = String(m?.key ?? m?.id ?? m?.model ?? '').trim();
        if (!id) return null;
        const name = typeof m?.name === 'string' ? m.name : undefined;
        const available = typeof m?.available === 'boolean' ? m.available : undefined;
        const tags = Array.isArray(m?.tags) ? m.tags.map((x: any) => String(x)) : undefined;
        return { id, name, available, tags };
      })
      .filter(Boolean) as Array<{ id: string; name?: string; available?: boolean; tags?: string[] }>;

    const providersRaw: any[] = Array.isArray((status as any)?.auth?.providers) ? (status as any).auth.providers : [];
    const configuredProviders = providersRaw
      .map((p) => String(p?.provider ?? '').trim())
      .filter((p) => p);

    // Best-effort: read per-agent auth-profiles.json (actual saved provider tokens + optional user label)
    const providerProfiles: Record<string, { profileId: string; label?: string }> = {};
    try {
      const agentDir = path.join(this.openclawStateDir, 'agents', 'main', 'agent');
      const authProfilesPath = path.join(agentDir, 'auth-profiles.json');
      const raw = await fs.promises.readFile(authProfilesPath, 'utf-8');
      const parsed: any = JSON.parse(raw);
      const profiles = parsed?.profiles && typeof parsed.profiles === 'object' ? parsed.profiles : null;
      if (profiles) {
        for (const [pid, entry] of Object.entries(profiles)) {
          if (!entry || typeof entry !== 'object') continue;
          const anyEntry = entry as Record<string, unknown>;
          const provider = String(anyEntry.provider ?? '').trim();
          if (!provider) continue;
          const type = String(anyEntry.type ?? '').trim().toLowerCase();
          const hasToken = typeof anyEntry.token === 'string' && anyEntry.token.trim().length > 0;
          // 排除 OAuth 等；兼容历史数据：有 token 但未写 type
          if (type === 'oauth' || type === 'oauth2') continue;
          if (!hasToken && type && type !== 'token' && type !== 'api_key') continue;
          if (!hasToken) continue;
          const lbl = typeof anyEntry.label === 'string' ? String(anyEntry.label).trim() : '';
          providerProfiles[provider] = { profileId: String(pid), ...(lbl ? { label: lbl } : {}) };
        }
      }
    } catch {
      // ignore
    }

    // Some CLIs may not report providers via models status, but we still want "configuredProviders"
    // to reflect what's saved locally.
    const configuredProvidersFromProfiles = Object.keys(providerProfiles);
    const mergedConfiguredProviders = Array.from(new Set([...configuredProviders, ...configuredProvidersFromProfiles]));

    return { defaultModelId, models, configuredProviders: mergedConfiguredProviders, providerProfiles };
  }

  async getPlugins(): Promise<any[]> {
    const list = await this.runJsonCommand(['plugins', 'list', '--json']);
    const arr: any[] = Array.isArray(list) ? list : Array.isArray((list as any)?.plugins) ? (list as any).plugins : [];
    return arr;
  }

  async installPlugin(spec: string): Promise<void> {
    await this.executeCommand(['plugins', 'install', `"${spec}"`], { checkExitCode: true });
  }

  async uninstallPlugin(id: string): Promise<void> {
    await this.executeCommand(['plugins', 'uninstall', `"${id}"`], { checkExitCode: true });
  }

  async enablePlugin(id: string): Promise<void> {
    await this.executeCommand(['plugins', 'enable', `"${id}"`], { checkExitCode: true });
  }

  async disablePlugin(id: string): Promise<void> {
    await this.executeCommand(['plugins', 'disable', `"${id}"`], { checkExitCode: true });
  }

  async inspectPlugin(id: string): Promise<any> {
    return await this.runJsonCommand(['plugins', 'inspect', `"${id}"`, '--json']);
  }

  /**
   * 验证 OpenClaw CLI 是否可用
   */
  async validateCLI(): Promise<boolean> {
    try {
      await this.getVersion();
      return true;
    } catch (error) {
      this.logError('CLI 验证失败:', error);
      return false;
    }
  }

  /**
   * 获取 OpenClaw 版本
   */
  async getVersion(): Promise<string> {
    const result = await this.executeCommand(['--version']);
    return result.stdout;
  }

  /**
   * 获取 Gateway 状态（通过 CLI 命令）
   */
  async getGatewayStatus(): Promise<'running' | 'stopped' | 'unknown'> {
    try {
      const result = await this.executeCommand(['gateway', 'status'], {
        checkExitCode: false,
      });

      const output = `${result.stdout} ${result.stderr}`.toLowerCase();

      // OpenClaw gateway status 会输出 connectivity probe 结果（更可靠）
      if (output.includes('connectivity probe: ok') || output.includes('probe: ok')) {
        return 'running';
      }
      if (
        output.includes('connectivity probe: failed') ||
        output.includes('econnrefused') ||
        output.includes('not running')
      ) {
        return 'stopped';
      }

      // 多种语言支持
      if (
        output.includes('running') ||
        output.includes('运行中') ||
        output.includes('active')
      ) {
        return 'running';
      }

      if (
        output.includes('stopped') ||
        output.includes('已停止') ||
        output.includes('inactive') ||
        output.includes('not running')
      ) {
        return 'stopped';
      }

      return 'unknown';
    } catch (error) {
      this.logError('获取 Gateway 状态失败:', error);
      return 'unknown';
    }
  }

  /**
   * 等待 Gateway 达到指定状态
   */
  private async waitForGatewayStatus(
    expectedStatus: 'running' | 'stopped',
    timeoutMs: number
  ): Promise<boolean> {
    const startTime = Date.now();
    const checkInterval = 500; // 每 500ms 检查一次

    while (Date.now() - startTime < timeoutMs) {
      const status = await this.getGatewayStatus();
      
      if (status === expectedStatus) {
        return true;
      }

      // 等待后再次检查
      await new Promise(resolve => setTimeout(resolve, checkInterval));
    }

    return false;
  }

  /**
   * 确保 OpenClaw 已配置
   */
  private async ensureConfigured(): Promise<void> {
    const configPath = this.openclawConfigFile;

    if (fs.existsSync(configPath)) {
      this.log('OpenClaw 已配置:', configPath);
      return;
    }

    this.log('OpenClaw 未配置，正在自动配置...');

    try {
      const cliPath = this.config.cliPath;
      const nodeExe = app.isPackaged ? path.join(process.resourcesPath, 'node.exe') : 'node';

      const onboardCmd = `"${nodeExe}" --experimental-vm-modules "${cliPath}" onboard --mode local --non-interactive --accept-risk`;

      this.log('运行配置命令:', onboardCmd);

      const { stdout, stderr } = await execAsync(onboardCmd, {
        timeout: 30000,
        windowsHide: true,
        env: this.getClawEnv(),
      });
      
      this.log('配置完成:', stdout);
      if (stderr) this.log('配置警告:', stderr);
    } catch (error: any) {
      this.logError('自动配置失败:', error.message);
      throw new Error('OpenClaw 配置失败，无法启动 Gateway');
    }
  }

  /**
   * 启动 Gateway
   */
  async startGateway(): Promise<void> {
    if (this.isStarting) {
      this.log('Gateway 正在启动中，跳过重复请求');
      return;
    }

    if (this.gatewayProcess) {
      this.log('Gateway 进程已存在，先停止旧进程');
      await this.stopGateway();
    }

    this.isStarting = true;
    this.emit('gateway:starting');

    try {
      // 确保 OpenClaw 已配置
      await this.ensureConfigured();
      
      this.log('正在启动 Gateway...');
      
      // 使用 spawn 运行 gateway run（前台运行，作为子进程）
      const cliPath = this.config.cliPath;
      const nodeExe = app.isPackaged 
        ? path.join(process.resourcesPath, 'node.exe')
        : 'node';
      
      const args = [
        '--experimental-vm-modules',
        cliPath,
        'gateway',
        'run',
        '--allow-unconfigured', // 允许未配置时启动
        ...(this.config.verbose ? (['--verbose'] as const) : []),
      ];
      
      this.log('Spawn 命令:', nodeExe, args.join(' '));
      
      this.gatewayProcess = spawn(nodeExe, args, {
        detached: false,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
        env: this.getClawEnv(),
        cwd: this.openclawStateDir,
      });

      this.log('Gateway 进程已启动, PID:', this.gatewayProcess.pid);

      // 早期失败检测：端口占用/权限问题等，避免一直等到超时
      const earlyFailure = new Promise<never>((_resolve, reject) => {
        const onData = (data: Buffer) => {
          const text = data.toString().toLowerCase();
          if (text.includes('already in use') || text.includes('eaddrinuse') || (text.includes('port') && text.includes('in use'))) {
            reject(new Error('Gateway 端口被占用（请关闭旧进程或更换端口）'));
            return;
          }
          if (text.includes('eperm') && text.includes('symlink')) {
            reject(new Error('Gateway 启动受限：Windows 缺少创建 symlink 权限（建议开启开发者模式或管理员运行）'));
          }
        };

        this.gatewayProcess?.stdout?.on('data', onData);
        this.gatewayProcess?.stderr?.on('data', onData);

        this.gatewayProcess?.once('close', (code) => {
          reject(new Error(`Gateway 进程提前退出（code=${code ?? 'unknown'}）`));
        });

        this.gatewayProcess?.once('error', (err) => {
          reject(new Error(`Gateway 进程启动失败：${err.message}`));
        });
      });

      // 子进程大量输出会淹没终端；仅在 verbose 时镜像到控制台（早期失败检测仍监听 pipe）。
      if (this.config.verbose) {
        if (this.gatewayProcess.stdout) {
          this.gatewayProcess.stdout.on('data', (data: Buffer) => {
            this.log('[Gateway stdout]:', data.toString().trim());
          });
        }
        if (this.gatewayProcess.stderr) {
          this.gatewayProcess.stderr.on('data', (data: Buffer) => {
            this.logError('[Gateway stderr]:', data.toString().trim());
          });
        }
      }

      // 监听进程退出
      this.gatewayProcess.on('close', (code) => {
        this.log('Gateway 进程已退出, 退出码:', code);
        this.gatewayProcess = null;
        this.emit('gateway:stopped');
      });

      this.gatewayProcess.on('error', (err) => {
        this.logError('Gateway 进程错误:', err.message);
        this.gatewayProcess = null;
        this.emit('gateway:error', err);
      });

      // 等待 Gateway 真正启动（通过状态检查确认）
      this.log('等待 Gateway 启动确认...');
      const started = await Promise.race([
        this.waitForGatewayStatus('running', this.config.gatewayStartTimeout),
        earlyFailure,
      ]);

      if (started) {
        this.log('Gateway 启动成功');
        this.emit('gateway:started');
      } else {
        throw new Error(`Gateway 启动超时（${this.config.gatewayStartTimeout}ms）`);
      }
    } catch (error: any) {
      this.logError('Gateway 启动失败:', error.message);
      this.emit('gateway:error', error);
      throw error;
    } finally {
      this.isStarting = false;
    }
  }

  /**
   * 停止 Gateway
   */
  async stopGateway(): Promise<void> {
    if (this.isStopping) {
      this.log('Gateway 正在停止中，跳过重复请求');
      return;
    }

    this.isStopping = true;
    this.emit('gateway:stopping');

    try {
      this.log('正在停止 Gateway...');

      // 如果有运行的进程，直接杀死
      if (this.gatewayProcess && !this.gatewayProcess.killed) {
        this.log('杀死 Gateway 进程, PID:', this.gatewayProcess.pid);
        
        // Windows 上需要用 taskkill 来杀死进程树
        if (process.platform === 'win32') {
          spawn('taskkill', ['/pid', this.gatewayProcess.pid!.toString(), '/f', '/t']);
        } else {
          this.gatewayProcess.kill('SIGTERM');
        }

        // 等待进程退出（最多 5 秒）
        await new Promise<void>((resolve) => {
          const timeout = setTimeout(() => {
            this.log('Gateway 进程未正常退出，强制杀死');
            this.gatewayProcess?.kill('SIGKILL');
            resolve();
          }, 5000);

          this.gatewayProcess!.on('close', () => {
            clearTimeout(timeout);
            resolve();
          });
        });

        this.gatewayProcess = null;
      } else {
        // 如果没有进程，尝试用 CLI 停止
        this.log('未找到运行中进程，尝试 CLI 停止命令');
        await this.executeCommand(['gateway', 'stop'], {
          timeout: 5000,
          checkExitCode: false,
        });
      }

      // 等待 Gateway 真正停止
      this.log('等待 Gateway 停止确认...');
      const stopped = await this.waitForGatewayStatus('stopped', 3000);

      if (stopped) {
        this.log('Gateway 已停止');
        this.emit('gateway:stopped');
      } else {
        this.log('Gateway 停止命令已执行，但状态未确认');
        this.emit('gateway:stopped');
      }
    } catch (error: any) {
      this.logError('Gateway 停止失败:', error.message);
      this.emit('gateway:error', error);
      throw error;
    } finally {
      this.isStopping = false;
    }
  }

  /**
   * 清理资源（应用退出时调用）
   */
  dispose(): void {
    this.log('清理引擎资源...');

    // 停止 Gateway 进程
    if (this.gatewayProcess && !this.gatewayProcess.killed) {
      this.log('正在停止 Gateway 进程...');
      
      if (process.platform === 'win32') {
        try {
          spawn('taskkill', ['/pid', this.gatewayProcess.pid!.toString(), '/f', '/t']);
        } catch (err) {
          this.logError('停止 Gateway 进程失败:', err);
        }
      } else {
        this.gatewayProcess.kill('SIGTERM');
      }

      this.gatewayProcess = null;
    } else {
      // 如果没有进程，尝试用 CLI 停止
      this.getGatewayStatus().then(status => {
        if (status === 'running') {
          this.log('正在停止 Gateway...');
          this.stopGateway().catch(err => {
            this.logError('停止 Gateway 失败:', err);
          });
        }
      });
    }

    this.removeAllListeners();
  }
}

const enginesByWorkspaceRoot = new Map<string, OpenClawEngineImpl>();

/**
 * CLI 路径、超时等与「当前选中的工作区」无关，但历史上每个 workspace 各有一份引擎实例；
 * updateConfig 若只写当前 active 引擎，切换工作区后新激活的实例仍用构造默认值，导致 getModels 等结果随工作区变化。
 * 此处持久化「用户通过设置写入的全局选项」，并在新建引擎时带入，且每次 IPC updateConfig 广播到全部实例。
 */
type SharedOpenClawEngineOptions = Partial<Omit<OpenClawEngineConfig, 'workspaceRoot'>>;
let sharedOpenClawEngineOptions: SharedOpenClawEngineOptions = {};

function applySharedOpenClawEngineConfig(partial: Partial<OpenClawEngineConfig>): void {
  const next = { ...partial } as Partial<OpenClawEngineConfig>;
  delete (next as { workspaceRoot?: string }).workspaceRoot;
  if (Object.keys(next).length === 0) return;
  sharedOpenClawEngineOptions = { ...sharedOpenClawEngineOptions, ...next };
  for (const eng of enginesByWorkspaceRoot.values()) {
    eng.updateConfig(next);
  }
}

let activeWorkspaceRoot = path.resolve(getDefaultWorkspacePath());

export function setActiveWorkspaceRoot(root: string): void {
  activeWorkspaceRoot = path.resolve(root);
}

export function getActiveWorkspaceRoot(): string {
  return activeWorkspaceRoot;
}

export function getEngineForWorkspace(workspaceRoot: string): OpenClawEngineImpl {
  const key = path.resolve(workspaceRoot);
  let eng = enginesByWorkspaceRoot.get(key);
  if (!eng) {
    eng = new OpenClawEngineImpl({ workspaceRoot: key, ...sharedOpenClawEngineOptions });
    enginesByWorkspaceRoot.set(key, eng);
  }
  return eng;
}

export function getActiveEngine(): OpenClawEngineImpl {
  return getEngineForWorkspace(activeWorkspaceRoot);
}

/**
 * 模型列表、鉴权、Gateway、技能/插件等 CLI 与全局磁盘状态 —— 与「当前选中的工作区」无关。
 * 统一使用默认工作区键下的引擎实例，避免随 activeWorkspace 切换而命中另一份进程内状态（子进程句柄、未同步的配置等）。
 * 对话存储仍使用 {@link getActiveEngine}。
 */
export function getGlobalOpenClawCliEngine(): OpenClawEngineImpl {
  return getEngineForWorkspace(path.resolve(getDefaultWorkspacePath()));
}

/** 兼容旧接口：始终返回当前激活 workspace 的引擎 */
export function getOpenClawEngine(config?: OpenClawEngineConfig): OpenClawEngine {
  const engine = getActiveEngine();
  if (config && Object.keys(config).length > 0) {
    applySharedOpenClawEngineConfig(config);
  }
  return engine;
}

/**
 * 注册 IPC 处理程序
 * @param config 可选的配置参数
 */
export function registerOpenClawIPC(config?: OpenClawEngineConfig): void {
  if (config && Object.keys(config).length > 0) {
    applySharedOpenClawEngineConfig(config);
  }

  ipcMain.handle('openclaw:getVersion', async () => {
    return await getGlobalOpenClawCliEngine().getVersion();
  });

  ipcMain.handle('openclaw:getGatewayStatus', async () => {
    return await getGlobalOpenClawCliEngine().getGatewayStatus();
  });

  ipcMain.handle('openclaw:startGateway', async () => {
    await getGlobalOpenClawCliEngine().startGateway();
  });

  ipcMain.handle('openclaw:stopGateway', async () => {
    await getGlobalOpenClawCliEngine().stopGateway();
  });

  ipcMain.handle('openclaw:getConfig', async () => {
    return getGlobalOpenClawCliEngine().getConfig();
  });

  ipcMain.handle('openclaw:updateConfig', async (_event, partial: Partial<OpenClawEngineConfig>) => {
    applySharedOpenClawEngineConfig(partial);
    return { success: true };
  });

  ipcMain.handle('openclaw:validateCLI', async () => {
    return await getGlobalOpenClawCliEngine().validateCLI();
  });

  ipcMain.handle(
    'openclaw:setModelAuthToken',
    async (_event, params: { provider: string; token: string; profileId?: string; label?: string }) => {
    await getGlobalOpenClawCliEngine().pasteModelAuthToken({
      provider: params.provider,
      token: params.token,
      profileId: params.profileId,
      label: params.label,
      agentId: 'main',
    });
    return { success: true };
    }
  );

  ipcMain.handle('openclaw:removeModelAuthToken', async (_event, params: { provider: string; profileId?: string }) => {
    return await getGlobalOpenClawCliEngine().removeModelAuthToken({
      provider: params.provider,
      profileId: params.profileId,
      agentId: 'main',
    });
  });

  ipcMain.handle('openclaw:setDefaultModel', async (_event, params: { modelId: string }) => {
    await getGlobalOpenClawCliEngine().setDefaultModel({ modelId: params.modelId });
    return { success: true };
  });

  ipcMain.handle('openclaw:removeListedModel', async (_event, params: { modelId: string; profileId?: string }) => {
    return await getGlobalOpenClawCliEngine().removeListedModelEntry({
      modelId: params.modelId,
      profileId: params.profileId,
    });
  });

  ipcMain.handle('openclaw:pickCliPath', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const dialogOpts: OpenDialogOptions = {
      title: '选择 OpenClaw 可执行文件',
      properties: ['openFile'],
      filters:
        process.platform === 'win32'
          ? [
              { name: 'Executable', extensions: ['exe', 'cmd', 'bat'] },
              { name: 'Node script', extensions: ['mjs', 'js', 'cjs'] },
              { name: 'All files', extensions: ['*'] },
            ]
          : [{ name: 'All files', extensions: ['*'] }],
    };
    const res = win ? await dialog.showOpenDialog(win, dialogOpts) : await dialog.showOpenDialog(dialogOpts);
    if (res.canceled || res.filePaths.length === 0) return null;
    return res.filePaths[0];
  });

  // 对话相关 IPC 接口
  ipcMain.handle('openclaw:sendMessage', async (_event, message: string, sessionId?: string, modelId?: string) => {
    try {
      const reply = await getActiveEngine().runAgentMessage(message, sessionId, modelId);
      return { success: true, message: reply };
    } catch (e: any) {
      const stderr = String(e?.stderr ?? '');
      const msg = String(e?.message ?? e);

      // Prefer actionable CLI stderr over generic invoke error
      if (stderr.includes('No API key found for provider')) {
        throw new Error(
          [
            'OpenClaw 未配置模型提供方的 API Key（例如 openai）。',
            '请按提示配置：openclaw agents add main（或在 OpenClaw 配置中为 main agent 设置 auth）。',
            '原始错误：' + stderr.trim(),
          ].join('\n')
        );
      }

      if (stderr.trim()) {
        throw new Error(stderr.trim());
      }

      throw new Error(msg);
    }
  });

  ipcMain.handle('openclaw:getModels', async () => {
    try {
      return await getGlobalOpenClawCliEngine().getModelsSummary();
    } catch (e: any) {
      console.warn('[OpenClawEngine] getModels failed:', e?.message || e);
      return { defaultModelId: null, models: [], configuredProviders: [], error: e?.message || String(e) };
    }
  });

  ipcMain.handle('openclaw:getConversations', async () => {
    const conversations = await getActiveEngine().listConversations();
    return { conversations };
  });

  ipcMain.handle('openclaw:deleteConversation', async (_event, conversationId: string) => {
    await getActiveEngine().removeConversation(conversationId);
    return { success: true };
  });

  ipcMain.handle('openclaw:upsertConversation', async (_event, conversation: ConversationRecord) => {
    if (!conversation || typeof conversation.id !== 'string') {
      throw new Error('Invalid conversation payload');
    }
    await getActiveEngine().upsertConversation(conversation);
    return { success: true };
  });

  // 连接器管理 IPC 接口
  ipcMain.handle('openclaw:getConnectors', async () => {
    try {
      const plugins = await getGlobalOpenClawCliEngine().getPlugins();
      const connectors = plugins.map((p: any) => {
        const id = String(p?.id ?? p?.name ?? p?.pluginId ?? p?.package ?? '');
        const name = String(p?.title ?? p?.displayName ?? p?.id ?? p?.name ?? id);
        const type = String(p?.format ?? p?.bundleFormat ?? p?.source ?? p?.marketplace ?? 'plugin');
        const enabled = Boolean(p?.enabled ?? p?.isEnabled ?? p?.active);
        return {
          id,
          name,
          type,
          config: p,
          status: enabled ? 'connected' : 'disconnected',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
      });
      return { connectors };
    } catch (e: any) {
      console.warn('[OpenClawEngine] getConnectors failed:', e?.message || e);
      return { connectors: [], error: e?.message || String(e) };
    }
  });

  ipcMain.handle('openclaw:addConnector', async (_event, config: any) => {
    const spec = String(config?.config?.spec ?? config?.spec ?? config?.name ?? '').trim();
    if (!spec) throw new Error('Missing plugin spec');
    await getGlobalOpenClawCliEngine().installPlugin(spec);
    return { success: true };
  });

  ipcMain.handle('openclaw:updateConnector', async (_event, id: string, config: any) => {
    const action = String(config?.action ?? '').toLowerCase();
    if (action === 'enable') await getGlobalOpenClawCliEngine().enablePlugin(id);
    else if (action === 'disable') await getGlobalOpenClawCliEngine().disablePlugin(id);
    else {
      // Fallback: treat update as enable/disable only for now.
      if (action) console.warn('[OpenClawEngine] updateConnector unsupported action:', action);
    }
    return { success: true };
  });

  ipcMain.handle('openclaw:deleteConnector', async (_event, id: string) => {
    await getGlobalOpenClawCliEngine().uninstallPlugin(id);
    return { success: true };
  });

  ipcMain.handle('openclaw:testConnector', async (_event, id: string) => {
    await getGlobalOpenClawCliEngine().inspectPlugin(id);
    return { success: true };
  });
}

/**
 * 获取引擎事件发射器（用于监听引擎事件）
 */
export function getOpenClawEngineEvents(): OpenClawEngineEventEmitter {
  return getActiveEngine();
}

/** 默认导出：当前激活 workspace 的引擎 */
export default getActiveEngine;
