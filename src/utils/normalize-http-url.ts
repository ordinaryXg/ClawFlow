/** 将用户或模型提供的字符串规范为可加载的 http(s) URL（与内嵌浏览器工具共用） */
export function normalizeHttpUrl(raw: string): string | null {
  const t = String(raw ?? '').trim();
  if (!t) return null;
  if (/^https?:\/\//i.test(t)) return t;
  if (/^[\w.-]+\.[a-z]{2,}(\/|$)/i.test(t)) return `https://${t}`;
  try {
    // eslint-disable-next-line no-new
    new URL(t);
    return t;
  } catch {
    return null;
  }
}

export function isSafeHttpUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}
