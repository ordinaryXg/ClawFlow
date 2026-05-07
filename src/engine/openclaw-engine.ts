import { ExecException, exec } from 'child_process';
import { app, ipcMain } from 'electron';
import { promisify } from 'util';
import EventEmitter from 'events';
import * as path from 'path';
import * as fs from 'fs';

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

/**
 * 解析 OpenClaw CLI 路径
 * 优先使用内置版本，回退到系统 PATH
 */
function resolveOpenClawPath(): string {
  const isDev = !app.isPackaged;
  
  if (isDev) {
    // 开发模式：使用本地安装的 openclaw
    return 'openclaw';
  }
  
  // 生产模式：从应用资源中解析
  const resourcesPath = process.resourcesPath || 
    (process.platform === 'darwin' 
      ? path.join(app.getAppPath(), '..', '..', '..', '..')  // macOS: ../../..
      : path.join(app.getAppPath(), '..'));                  // Windows/Linux: ../
  
  // 尝试多个可能位置（按优先级）
  const possiblePaths = [
    // 1. postPackage 钩子复制的位置（推荐）
    path.join(resourcesPath, 'openclaw-cli', 'openclaw.mjs'),
    path.join(resourcesPath, 'openclaw-cli', 'bin', 'openclaw.mjs'),
    // 2. 解压的 asar 位置（如果配置了 asarUnpack）
    path.join(resourcesPath, 'app.asar.unpacked', 'node_modules', 'openclaw', 'openclaw.mjs'),
    path.join(resourcesPath, 'app.asar.unpacked', 'node_modules', '.bin', 'openclaw'),
    // 3. 未打包的 node_modules（如果 asar: false）
    path.join(resourcesPath, 'app', 'node_modules', '.bin', 'openclaw'),
    path.join(app.getAppPath(), 'node_modules', '.bin', 'openclaw'),
  ];
  
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      return p;
    }
  }
  
  // 回退到系统 PATH 中的 openclaw
  console.warn('[OpenClawEngine] 未找到内置 OpenClaw，尝试使用系统版本');
  return 'openclaw';
}

/**
 * OpenClaw 引擎实现类
 */
class OpenClawEngineImpl extends EventEmitter implements OpenClawEngine, OpenClawEngineEventEmitter {
  private config: Required<OpenClawEngineConfig>;
  private isStarting = false;
  private isStopping = false;

  constructor(config: OpenClawEngineConfig = {}) {
    super();
    
    // 解析 OpenClaw 路径
    const resolvedCliPath = config.cliPath ?? resolveOpenClawPath();
    
    this.config = {
      cliPath: resolvedCliPath,
      commandTimeout: config.commandTimeout ?? 30000,
      gatewayStartTimeout: config.gatewayStartTimeout ?? 5000,
      verbose: config.verbose ?? false,
    };
    
    this.log('解析 OpenClaw CLI 路径:', this.config.cliPath);
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<OpenClawEngineConfig>): void {
    this.config = {
      ...this.config,
      ...config,
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
      console.log('[OpenClawEngine]', ...args);
    }
  }

  /**
   * 内部错误日志方法
   */
  private logError(...args: any[]): void {
    console.error('[OpenClawEngine]', ...args);
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
    const commandPrefix = this.getCommandPrefix();
    const fullCommand = `${commandPrefix} ${args.join(' ')}`;

    this.log('执行命令:', fullCommand);

    try {
      const { stdout, stderr } = await execAsync(fullCommand, {
        timeout,
        windowsHide: true,
      });

      this.emit('command:executed', command, args);
      this.log('命令执行成功:', fullCommand);

      return {
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        exitCode: 0,
      };
    } catch (error: any) {
      const execError = error as ExecException & { stdout?: string; stderr?: string; code?: number };
      
      this.logError('命令执行失败:', fullCommand, execError.message);
      this.emit('command:error', command, args, execError);

      // 如果不检查退出码，则视为成功（某些命令退出码非0但仍有输出）
      if (!checkExitCode) {
        return {
          stdout: (execError.stdout ?? '').trim(),
          stderr: (execError.stderr ?? '').trim(),
          exitCode: execError.code ?? null,
        };
      }

      throw execError;
    }
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
   * 启动 Gateway
   */
  async startGateway(): Promise<void> {
    if (this.isStarting) {
      this.log('Gateway 正在启动中，跳过重复请求');
      return;
    }

    this.isStarting = true;
    this.emit('gateway:starting');

    try {
      this.log('正在启动 Gateway...');
      
      // 使用 executeCommand 启动 Gateway（CLI 会作为守护进程在后台运行）
      await this.executeCommand(['gateway', 'start']);
      
      // 等待 Gateway 真正启动（通过状态检查确认）
      this.log('等待 Gateway 启动确认...');
      const started = await this.waitForGatewayStatus('running', this.config.gatewayStartTimeout);

      if (started) {
        this.log('Gateway 启动成功');
        this.emit('gateway:started');
      } else {
        throw new Error(`Gateway 启动超时（${this.config.gatewayStartTimeout}ms）`);
      }
    } catch (error: any) {
      this.logError('Gateway 启动失败:', error);
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
      
      // 使用 executeCommand 停止 Gateway
      await this.executeCommand(['gateway', 'stop']);
      
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
      this.logError('Gateway 停止失败:', error);
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

    // 尝试停止 Gateway
    this.getGatewayStatus().then(status => {
      if (status === 'running') {
        this.log('正在停止 Gateway...');
        this.stopGateway().catch(err => {
          this.logError('停止 Gateway 失败:', err);
        });
      }
    });

    this.removeAllListeners();
  }
}

/** 引擎实例（单例） */
let engineInstance: OpenClawEngineImpl | null = null;

/**
 * 获取引擎实例
 */
export function getOpenClawEngine(config?: OpenClawEngineConfig): OpenClawEngine {
  if (!engineInstance) {
    engineInstance = new OpenClawEngineImpl(config);
  } else if (config) {
    engineInstance.updateConfig(config);
  }
  return engineInstance;
}

/**
 * 注册 IPC 处理程序
 * @param config 可选的配置参数
 */
export function registerOpenClawIPC(config?: OpenClawEngineConfig): void {
  const engine = getOpenClawEngine(config);

  ipcMain.handle('openclaw:getVersion', async () => {
    return await engine.getVersion();
  });

  ipcMain.handle('openclaw:getGatewayStatus', async () => {
    return await engine.getGatewayStatus();
  });

  ipcMain.handle('openclaw:startGateway', async () => {
    await engine.startGateway();
  });

  ipcMain.handle('openclaw:stopGateway', async () => {
    await engine.stopGateway();
  });

  ipcMain.handle('openclaw:getConfig', async () => {
    return engine.getConfig();
  });

  ipcMain.handle('openclaw:updateConfig', async (_event, config: Partial<OpenClawEngineConfig>) => {
    engine.updateConfig(config);
    return { success: true };
  });

  ipcMain.handle('openclaw:validateCLI', async () => {
    return await engine.validateCLI();
  });
}

/**
 * 获取引擎事件发射器（用于监听引擎事件）
 */
export function getOpenClawEngineEvents(): OpenClawEngineEventEmitter {
  return getOpenClawEngine() as OpenClawEngineImpl;
}

/** 默认导出引擎实例 */
export default getOpenClawEngine();
