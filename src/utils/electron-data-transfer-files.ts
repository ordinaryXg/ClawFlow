/** 从拖放 DataTransfer 解析本地绝对路径（需 Electron `webUtils.getPathForFile` 暴露为 `electronAPI.getPathForFile`） */

export function hasDataTransferFileDrag(dt: DataTransfer | null): boolean {
  if (!dt) return false;
  return [...dt.types].includes('Files');
}

export function pathsFromDataTransferFiles(dt: DataTransfer): string[] {
  const api = window.electronAPI;
  if (!api?.getPathForFile || dt.files.length === 0) return [];
  const out: string[] = [];
  for (let i = 0; i < dt.files.length; i++) {
    try {
      out.push(api.getPathForFile(dt.files[i]));
    } catch {
      /* ignore */
    }
  }
  return out;
}

export function posixBasename(absPath: string): string {
  const n = String(absPath ?? '')
    .trim()
    .replace(/\\/g, '/')
    .split('/')
    .pop();
  return n && n !== '.' && n !== '..' ? n : absPath;
}
