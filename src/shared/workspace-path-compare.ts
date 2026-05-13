/** 与 chatStore / 主进程工作区比对逻辑一致，用于渲染进程判断是否为同一工作区根路径 */
export function normalizeWorkspacePathForCompare(p: string | null | undefined): string {
  return String(p ?? '')
    .trim()
    .replace(/[/\\]+$/, '')
    .replace(/\\/g, '/')
    .toLowerCase();
}
