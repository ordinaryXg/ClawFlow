/** 紧凑展示字节数（用于 UI，非 IEC 二进制前缀） */
export function formatUtf8Bytes(n: number): string {
  const x = Math.max(0, Math.floor(Number(n) || 0));
  if (x < 1024) return `${x} B`;
  if (x < 1024 * 1024) return `${(x / 1024).toFixed(x < 10 * 1024 ? 1 : 0)} KB`;
  if (x < 1024 * 1024 * 1024) return `${(x / (1024 * 1024)).toFixed(x < 10 * 1024 * 1024 ? 1 : 0)} MB`;
  return `${(x / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}
