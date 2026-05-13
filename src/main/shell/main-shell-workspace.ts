/** 主便签窗口「自己的」当前工作区记忆；与卫星获得焦点时写入的全局 active 解耦 */

let mainShellLastWorkspacePath: string | null = null;

export function getMainShellLastWorkspacePath(): string | null {
  return mainShellLastWorkspacePath;
}

export function setMainShellLastWorkspacePath(next: string | null): void {
  mainShellLastWorkspacePath = next;
}
