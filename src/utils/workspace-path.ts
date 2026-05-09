/** 工作区路径展示名（文件夹名） */
export function workspaceFolderLabel(fullPath: string): string {
  return (
    String(fullPath)
      .replace(/[/\\]+$/, '')
      .split(/[/\\]/)
      .pop() || fullPath
  );
}

export function workspacePathsLikelyEqual(a: string, b: string): boolean {
  const norm = (s: string) =>
    String(s)
      .trim()
      .replace(/[/\\]+$/, '')
      .replace(/\\/g, '/')
      .toLowerCase();
  return norm(a) === norm(b);
}
