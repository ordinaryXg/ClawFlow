/**
 * Windows 控制台默认常为 GBK（936），与 Node 写入的 UTF-8 字节不匹配会出现「宸茶…」类乱码。
 * 在进程早期将当前控制台切到 UTF-8（65001），便于主进程与 SDK 的中文日志正确显示。
 * 失败时静默忽略（无控制台权限、非交互环境等）。
 */
import { execSync } from 'child_process';

if (process.platform === 'win32') {
  try {
    execSync('chcp 65001', { stdio: 'ignore' });
  } catch {
    /* ignore */
  }
}
