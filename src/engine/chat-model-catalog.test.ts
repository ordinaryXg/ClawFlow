import {
  buildGroupedChatModelCatalog,
  normalizeToProviderRepresentative,
  pickGroupedCatalogModelId,
} from './chat-model-catalog';

describe('chat-model-catalog', () => {
  it('normalizes legacy per-model ids to provider representative', () => {
    expect(normalizeToProviderRepresentative('deepseek/deepseek-v4-pro')).toBe('deepseek/deepseek-v4-flash');
    expect(normalizeToProviderRepresentative('openai/gpt-4o-mini')).toBe('openai/gpt-4o');
  });

  it('builds one row per registered provider', () => {
    const rows = buildGroupedChatModelCatalog({
      registeredProviderIds: ['deepseek', 'openai'],
      providerHasKey: (p) => p === 'deepseek',
    });
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ id: 'deepseek/deepseek-v4-flash', label: 'DeepSeek', available: true });
    expect(rows[1]).toMatchObject({ id: 'openai/gpt-4o', label: 'OpenAI', available: false });
  });

  it('pickGroupedCatalogModelId maps saved legacy id to representative', () => {
    const rows = buildGroupedChatModelCatalog({
      registeredProviderIds: ['deepseek'],
      providerHasKey: () => true,
    });
    expect(pickGroupedCatalogModelId('deepseek/deepseek-reasoner', rows, null)).toBe('deepseek/deepseek-v4-flash');
  });
});
