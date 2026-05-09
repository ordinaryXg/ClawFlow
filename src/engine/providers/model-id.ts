/** `provider/model` → `model` segment for upstream APIs */
export function apiModelFromClawId(modelId: string): string {
  const id = String(modelId ?? '').trim();
  const idx = id.indexOf('/');
  if (idx <= 0) return id;
  return id.slice(idx + 1).trim() || id;
}
