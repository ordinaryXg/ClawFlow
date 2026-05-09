/**
 * OpenClaw `models list` 可能为空，但 auth 已配置。合并 CLI 列表与已配置提供方，供设置页 / 对话页展示可选模型。
 */
export const PROVIDER_FALLBACK_MODEL_ID: Record<string, string> = {
  deepseek: 'deepseek/deepseek-chat',
  openai: 'openai/gpt-4o-mini',
};

export type ModelDisplayRow = { id: string; available?: boolean; tags?: string[] };

export function mergeConfiguredModelsForDisplay(
  models: ModelDisplayRow[],
  providers: string[],
  /** 例如来自本地 auth-profiles 的 provider 键，防止 CLI 未上报时左侧/下拉为空 */
  extraProviders?: string[]
): ModelDisplayRow[] {
  const mergedProviders = Array.from(
    new Set(
      [...(providers ?? []), ...(extraProviders ?? [])]
        .map((x) => String(x ?? '').trim())
        .filter(Boolean)
    )
  );

  const result = models.map((m) => ({ ...m }));
  const idSet = new Set(result.map((m) => m.id));
  const providerHasModel = (p: string) => result.some((m) => m.id === p || m.id.startsWith(`${p}/`));

  for (const raw of mergedProviders) {
    const p = String(raw ?? '').trim();
    if (!p || providerHasModel(p)) continue;
    const fallbackId = PROVIDER_FALLBACK_MODEL_ID[p] ?? `${p}/default`;
    if (!idSet.has(fallbackId)) {
      result.push({ id: fallbackId });
      idSet.add(fallbackId);
    }
  }
  return result;
}
