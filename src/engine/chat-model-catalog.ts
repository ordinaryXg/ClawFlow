/** Chat 下拉：按服务商聚合后的代表模型 id 与展示名 */
export const CHAT_PROVIDER_REPRESENTATIVE_MODEL: Record<string, string> = {
  deepseek: 'deepseek/deepseek-v4-flash',
  openai: 'openai/gpt-4o',
  anthropic: 'anthropic/claude-3-5-sonnet-20241022',
};

export const CHAT_PROVIDER_DISPLAY_NAME: Record<string, string> = {
  deepseek: 'DeepSeek',
  openai: 'OpenAI',
  anthropic: 'Anthropic',
};

export function providerIdFromCatalogModelId(modelId: string): string | null {
  const id = String(modelId ?? '').trim();
  const idx = id.indexOf('/');
  if (idx <= 0) return null;
  return id.slice(0, idx);
}

export function representativeModelIdForProvider(providerId: string): string | null {
  const p = String(providerId ?? '').trim();
  return CHAT_PROVIDER_REPRESENTATIVE_MODEL[p] ?? null;
}

/** 将目录内任意同服务商模型 id 规范为代表项（用于 UI 与持久化） */
export function normalizeToProviderRepresentative(modelId: string): string {
  const id = String(modelId ?? '').trim();
  if (!id) return id;
  const prov = providerIdFromCatalogModelId(id);
  if (!prov) return id;
  return representativeModelIdForProvider(prov) ?? id;
}

export function isKnownChatProvider(providerId: string): boolean {
  return Boolean(CHAT_PROVIDER_REPRESENTATIVE_MODEL[String(providerId ?? '').trim()]);
}

export function providerDisplayLabel(providerId: string): string {
  const p = String(providerId ?? '').trim();
  return CHAT_PROVIDER_DISPLAY_NAME[p] ?? p;
}

export type ChatModelCatalogRow = { id: string; label: string; available: boolean };

/** 内置目录按服务商合并为一行 */
export function buildGroupedChatModelCatalog(params: {
  registeredProviderIds: readonly string[];
  providerHasKey: (providerId: string) => boolean;
  profileLabelByProvider?: Map<string, string>;
}): ChatModelCatalogRow[] {
  const models: ChatModelCatalogRow[] = [];
  for (const providerId of params.registeredProviderIds) {
    const rep = representativeModelIdForProvider(providerId);
    if (!rep) continue;
    const extra = params.profileLabelByProvider?.get(providerId);
    const base = providerDisplayLabel(providerId);
    models.push({
      id: rep,
      label: extra ? `${base} · ${extra}` : base,
      available: params.providerHasKey(providerId),
    });
  }
  return models;
}

/** 在聚合列表中解析已保存或历史的模型 id */
export function pickGroupedCatalogModelId(
  savedId: string | null | undefined,
  rows: readonly ChatModelCatalogRow[],
  engineDefaultId: string | null | undefined
): string | null {
  const ids = new Set(rows.map((r) => r.id));
  const saved = String(savedId ?? '').trim();
  if (saved) {
    const norm = normalizeToProviderRepresentative(saved);
    if (ids.has(norm)) return norm;
  }
  const def = String(engineDefaultId ?? '').trim();
  if (def) {
    const norm = normalizeToProviderRepresentative(def);
    if (ids.has(norm)) return norm;
  }
  return rows.find((m) => m.available)?.id ?? rows[0]?.id ?? null;
}
