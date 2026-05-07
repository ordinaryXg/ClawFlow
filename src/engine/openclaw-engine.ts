import { ExecException, exec, spawn, ChildProcess } from 'child_process';
import { app, ipcMain } from 'electron';
import { promisify } from 'util';
import EventEmitter from 'events';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

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
  private gatewayProcess: ChildProcess | null = null;

  constructor(config: OpenClawEngineConfig = {}) {
    super();
    
    // 解析 OpenClaw 路径
    const resolvedCliPath = config.cliPath ?? resolveOpenClawPath();
    
    this.config = {
      cliPath: resolvedCliPath,
      commandTimeout: config.commandTimeout ?? 60000, // 增加到 60 秒
      gatewayStartTimeout: config.gatewayStartTimeout ?? 30000, // 增加到 30 秒
      verbose: config.verbose ?? true, // 默认启用详细日志
    };
    
    this.log('OpenClawEngine 初始化完成');
    this.log('  CLI 路径:', this.config.cliPath);
    this.log('  命令超时:', this.config.commandTimeout, 'ms');
    this.log('  Gateway 启动超时:', this.config.gatewayStartTimeout, 'ms');
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
      });

      this.log('命令执行成功');
      this.log('  stdout:', stdout);
      this.log('  stderr:', stderr);
      
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
   * 确保 OpenClaw 已配置
   */
  private async ensureConfigured(): Promise<void> {
    const configPath = path.join(os.homedir(), '.openclaw', 'openclaw.json');
    
    if (fs.existsSync(configPath)) {
      this.log('OpenClaw 已配置:', configPath);
      return;
    }

    this.log('OpenClaw 未配置，正在自动配置...');
    
    try {
      const cliPath = this.config.cliPath;
      const nodeExe = app.isPackaged 
        ? path.join(process.resourcesPath, 'node.exe')
        : 'node';
      
      const onboardCmd = `"${nodeExe}" --experimental-vm-modules "${cliPath}" onboard --mode local --non-interactive --accept-risk`;
      
      this.log('运行配置命令:', onboardCmd);
      
      const { stdout, stderr } = await execAsync(onboardCmd, {
        timeout: 30000,
        windowsHide: true,
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
        '--allow-unconfigured',  // 允许未配置时启动
        '--verbose'               // 详细日志
      ];
      
      this.log('Spawn 命令:', nodeExe, args.join(' '));
      
      this.gatewayProcess = spawn(nodeExe, args, {
        detached: false,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      });

      this.log('Gateway 进程已启动, PID:', this.gatewayProcess.pid);

      // 监听输出
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
      const started = await this.waitForGatewayStatus('running', this.config.gatewayStartTimeout);

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

  // 对话相关 IPC 接口
  ipcMain.handle('openclaw:sendMessage', async (_event, message: string) => {
    // TODO: 实现发送消息到 OpenClaw 的逻辑
    console.log('[OpenClawEngine] 发送消息:', message);
    return { success: true, message: '消息已发送（模拟）' };
  });

  ipcMain.handle('openclaw:getConversations', async () => {
    // TODO: 实现获取对话历史的逻辑
    console.log('[OpenClawEngine] 获取对话历史');
    return { conversations: [] };
  });

  ipcMain.handle('openclaw:deleteConversation', async (_event, conversationId: string) => {
    // TODO: 实现删除对话的逻辑
    console.log('[OpenClawEngine] 删除对话:', conversationId);
    return { success: true };
  });

  // 技能管理 IPC 接口
  ipcMain.handle('openclaw:getSkills', async () => {
    // TODO: 实现获取技能列表的逻辑
    console.log('[OpenClawEngine] 获取技能列表');
    return { skills: [] };
  });

  ipcMain.handle('openclaw:installSkill', async (_event, skillName: string) => {
    // TODO: 实现安装技能的逻辑
    console.log('[OpenClawEngine] 安装技能:', skillName);
    return { success: true };
  });

  ipcMain.handle('openclaw:uninstallSkill', async (_event, skillName: string) => {
    // TODO: 实现卸载技能的逻辑
    console.log('[OpenClawEngine] 卸载技能:', skillName);
    return { success: true };
  });

  ipcMain.handle('openclaw:enableSkill', async (_event, skillName: string) => {
    // TODO: 实现启用技能的逻辑
    console.log('[OpenClawEngine] 启用技能:', skillName);
    return { success: true };
  });

  ipcMain.handle('openclaw:disableSkill', async (_event, skillName: string) => {
    // TODO: 实现禁用技能的逻辑
    console.log('[OpenClawEngine] 禁用技能:', skillName);
    return { success: true };
  });

  // 连接器管理 IPC 接口
  ipcMain.handle('openclaw:getConnectors', async () => {
    // TODO: 实现获取连接器列表的逻辑
    console.log('[OpenClawEngine] 获取连接器列表');
    return { connectors: [] };
  });

  ipcMain.handle('openclaw:addConnector', async (_event, config: any) => {
    // TODO: 实现添加连接器的逻辑
    console.log('[OpenClawEngine] 添加连接器:', config);
    return { success: true };
  });

  ipcMain.handle('openclaw:updateConnector', async (_event, id: string, config: any) => {
    // TODO: 实现更新连接器的逻辑
    console.log('[OpenClawEngine] 更新连接器:', id, config);
    return { success: true };
  });

  ipcMain.handle('openclaw:deleteConnector', async (_event, id: string) => {
    // TODO: 实现删除连接器的逻辑
    console.log('[OpenClawEngine] 删除连接器:', id);
    return { success: true };
  });

  ipcMain.handle('openclaw:testConnector', async (_event, id: string) => {
    // TODO: 实现测试连接器连接的逻辑
    console.log('[OpenClawEngine] 测试连接器:', id);
    return { success: true };
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
