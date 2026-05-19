/**
 * Hermes 向量检索偏好（userData）：Ollama / OpenAI 兼容 embedding API + sqlite-vec 混合权重。
 */

import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';

export type HermesEmbeddingProvider = 'ollama' | 'openai';

export type HermesEmbeddingPrefsStored = {
  enabled?: boolean;
  provider?: HermesEmbeddingProvider;
  /** Ollama 默认 http://127.0.0.1:11434 */
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  /** FTS 权重 α；向量权重为 (1-α) */
  hybridAlpha?: number;
  dimensions?: number;
};

const FILENAME = 'cf.hermes-embedding-prefs.json';

const DEFAULTS: Required<
  Pick<HermesEmbeddingPrefsStored, 'enabled' | 'provider' | 'baseUrl' | 'model' | 'hybridAlpha' | 'dimensions'>
> = {
  enabled: false,
  provider: 'ollama',
  baseUrl: 'http://127.0.0.1:11434',
  model: 'nomic-embed-text',
  hybridAlpha: 0.55,
  dimensions: 768,
};

function filePath(): string {
  return path.join(app.getPath('userData'), FILENAME);
}

export function readHermesEmbeddingPrefsFile(): HermesEmbeddingPrefsStored | null {
  try {
    const raw = fs.readFileSync(filePath(), 'utf-8');
    const j = JSON.parse(raw) as HermesEmbeddingPrefsStored;
    if (!j || typeof j !== 'object') return null;
    return j;
  } catch {
    return null;
  }
}

export function writeHermesEmbeddingPrefsFile(prefs: HermesEmbeddingPrefsStored): void {
  fs.mkdirSync(path.dirname(filePath()), { recursive: true });
  fs.writeFileSync(filePath(), JSON.stringify(prefs, null, 2), 'utf-8');
}

export function resolveHermesEmbeddingPrefs(raw?: HermesEmbeddingPrefsStored | null): {
  enabled: boolean;
  provider: HermesEmbeddingProvider;
  baseUrl: string;
  apiKey: string;
  model: string;
  hybridAlpha: number;
  dimensions: number;
} {
  const p = raw ?? readHermesEmbeddingPrefsFile();
  const provider = p?.provider === 'openai' ? 'openai' : 'ollama';
  const hybridAlpha =
    typeof p?.hybridAlpha === 'number' && Number.isFinite(p.hybridAlpha)
      ? Math.min(1, Math.max(0, p.hybridAlpha))
      : DEFAULTS.hybridAlpha;
  const dimensions =
    typeof p?.dimensions === 'number' && p.dimensions >= 64 && p.dimensions <= 4096
      ? Math.floor(p.dimensions)
      : DEFAULTS.dimensions;
  return {
    enabled: Boolean(p?.enabled),
    provider,
    baseUrl: String(p?.baseUrl ?? (provider === 'ollama' ? DEFAULTS.baseUrl : 'https://api.openai.com/v1')).trim(),
    apiKey: String(p?.apiKey ?? '').trim(),
    model: String(p?.model ?? (provider === 'ollama' ? DEFAULTS.model : 'text-embedding-3-small')).trim(),
    hybridAlpha,
    dimensions,
  };
}
