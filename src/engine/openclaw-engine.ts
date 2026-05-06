import { spawn, ChildProcess } from 'child_process';
import { ipcMain } from 'electron';
import { promisify } from 'util';
import { exec } from 'child_process';

const execAsync = promisify(exec);

export interface OpenClawEngine {
  getVersion(): Promise<string>;
  getGatewayStatus(): Promise<'running' | 'stopped' | 'unknown'>;
  startGateway(): Promise<void>;
  stopGateway(): Promise<void>;
}

class OpenClawEngineImpl implements OpenClawEngine {
  private gatewayProcess: ChildProcess | null = null;

  async getVersion(): Promise<string> {
    try {
      const { stdout } = await execAsync('openclaw --version');
      return stdout.trim();
    } catch (error) {
      console.error('获取 OpenClaw 版本失败:', error);
      throw error;
    }
  }

  async getGatewayStatus(): Promise<'running' | 'stopped' | 'unknown'> {
    try {
      const { stdout } = await execAsync('openclaw gateway status');
      if (stdout.includes('running') || stdout.includes('运行中')) {
        return 'running';
      } else if (stdout.includes('stopped') || stdout.includes('已停止')) {
        return 'stopped';
      }
      return 'unknown';
    } catch (error: any) {
      // 如果命令执行失败（退出码非0），可能表示 Gateway 未运行
      if (error.code === 1 || error.stderr?.includes('not running')) {
        return 'stopped';
      }
      return 'unknown';
    }
  }

  async startGateway(): Promise<void> {
    if (this.gatewayProcess) {
      console.log('Gateway 已经在运行');
      return;
    }

    return new Promise((resolve, reject) => {
      try {
        this.gatewayProcess = spawn('openclaw', ['gateway', 'start'], {
          detached: true,
          stdio: 'ignore',
        });

        this.gatewayProcess.unref();

        // 简单等待 2 秒后认为启动成功
        setTimeout(() => {
          resolve();
        }, 2000);
      } catch (error) {
        reject(error);
      }
    });
  }

  async stopGateway(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const stopProcess = spawn('openclaw', ['gateway', 'stop']);
        
        stopProcess.on('close', (code) => {
          this.gatewayProcess = null;
          if (code === 0) {
            resolve();
          } else {
            reject(new Error(`停止 Gateway 失败，退出码: ${code}`));
          }
        });

        stopProcess.on('error', (err) => {
          reject(err);
        });
      } catch (error) {
        reject(error);
      }
    });
  }
}

// 导出单例
const engine = new OpenClawEngineImpl();

// 注册 IPC 处理程序
export function registerOpenClawIPC() {
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
}

export default engine;
