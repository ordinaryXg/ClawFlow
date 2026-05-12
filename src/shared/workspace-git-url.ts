/** 从 Git 远程 URL 推导仓库文件夹名（渲染进程 / 主进程共用，无 Node 专属依赖） */

export function deriveRepoFolderNameFromGitUrl(remoteUrl: string): string {
  let u = remoteUrl.trim().replace(/^git\+/, '');
  const q = u.indexOf('?');
  if (q >= 0) u = u.slice(0, q);
  u = u.replace(/\.git$/i, '').replace(/\/$/, '');
  const parts = u.split(/[/:]/).filter(Boolean);
  let name = parts[parts.length - 1] || 'repository';
  name = safeFolderName(name);
  return name || 'repository';
}

function safeFolderName(name: string): string {
  const s = name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '-').replace(/^\.+/, '').slice(0, 120).trim();
  return s || 'repository';
}
