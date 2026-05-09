import type { ModelProvider } from './providers/provider';

export class ProviderRouter {
  private providers = new Map<string, ModelProvider>();

  register(provider: ModelProvider): void {
    this.providers.set(provider.id, provider);
  }

  get(providerId: string): ModelProvider | null {
    return this.providers.get(providerId) ?? null;
  }

  listRegisteredIds(): string[] {
    return Array.from(this.providers.keys());
  }

  /** `deepseek/xxx` -> `deepseek` */
  resolveProviderIdFromModelId(modelId: string): string | null {
    const id = String(modelId ?? '').trim();
    if (!id) return null;
    const idx = id.indexOf('/');
    if (idx <= 0) return null;
    return id.slice(0, idx);
  }
}

