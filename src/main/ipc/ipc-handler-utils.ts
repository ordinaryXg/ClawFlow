import { ipcMain, type IpcMainInvokeEvent } from 'electron';

/** 热重载 / 重复注册时先 remove，再 handle。 */
export function replaceIpcHandler(
  channel: string,
  handler: (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown | Promise<unknown>
): void {
  try {
    ipcMain.removeHandler(channel);
  } catch {
    /* first load or older Electron */
  }
  ipcMain.handle(channel, handler);
}
