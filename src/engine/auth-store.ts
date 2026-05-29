import * as fs from 'fs';
import * as path from 'path';
import { safeStorage } from 'electron';
import { randomUUID } from 'crypto';
import { globalClawflowRoot } from '../main/workspace/workspace-service';

export type AuthProfile = {
  provider: string;
  profileId: string;
  label?: string;
  /** Optional tag for grouping (e.g. personal/work). Pure metadata. */
  environment?: 'personal' | 'work' | 'custom';
  /** Encrypted token (base64). Plain token is never stored in v2 payload. */
  tokenCiphertext: string;
  encryption: 'electron.safeStorage';
  createdAt: number;
  updatedAt: number;
};

export type AuthStorePayloadV2 = {
  version: 2;
  profiles: Record<string, AuthProfile>;
  activeProfileIdByProvider?: Record<string, string>;
};

const STORE_FILE_V2 = 'auth-profiles.v2.json';

function storePath(): string {
  return path.join(globalClawflowRoot(), STORE_FILE_V2);
}

function encryptToBase64(plain: string): string {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('Secure storage is not available on this device');
  }
  const buf = safeStorage.encryptString(String(plain ?? ''));
  return buf.toString('base64');
}

function decryptFromBase64(cipherB64: string): string {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('Secure storage is not available on this device');
  }
  const buf = Buffer.from(String(cipherB64 ?? ''), 'base64');
  return safeStorage.decryptString(buf);
}

async function readPayloadV2(): Promise<AuthStorePayloadV2 | null> {
  try {
    const raw = await fs.promises.readFile(storePath(), 'utf-8');
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed === 'object' &&
      parsed.version === 2 &&
      parsed.profiles &&
      typeof parsed.profiles === 'object'
    ) {
      const p = parsed as AuthStorePayloadV2;
      if (!p.activeProfileIdByProvider || typeof p.activeProfileIdByProvider !== 'object') {
        p.activeProfileIdByProvider = {};
      }
      return p;
    }
  } catch {
    // ignore
  }
  return null;
}

async function writePayloadV2(payload: AuthStorePayloadV2): Promise<void> {
  await fs.promises.mkdir(path.dirname(storePath()), { recursive: true });
  await fs.promises.writeFile(storePath(), JSON.stringify(payload, null, 2), 'utf-8');
}

async function ensurePayloadV2(): Promise<AuthStorePayloadV2> {
  const v2 = await readPayloadV2();
  if (v2) return v2;
  const empty: AuthStorePayloadV2 = { version: 2, profiles: {}, activeProfileIdByProvider: {} };
  await writePayloadV2(empty);
  return empty;
}

export async function upsertAuthProfile(params: {
  provider: string;
  token: string;
  profileId?: string;
  label?: string;
  environment?: 'personal' | 'work' | 'custom';
}): Promise<{ profileId: string }> {
  const provider = String(params.provider ?? '').trim();
  const token = String(params.token ?? '').trim();
  const profileId = String(params.profileId ?? `${provider}:${randomUUID()}`).trim();
  const label = typeof params.label === 'string' ? params.label.trim() : '';
  const environment =
    params.environment === 'personal' || params.environment === 'work' || params.environment === 'custom'
      ? params.environment
      : undefined;
  if (!provider) throw new Error('Missing provider');
  if (!token) throw new Error('Missing token');
  if (!profileId) throw new Error('Missing profileId');

  const now = Date.now();
  const payload = await ensurePayloadV2();
  const prev = payload.profiles[profileId];
  payload.profiles[profileId] = {
    provider,
    profileId,
    ...(label ? { label } : {}),
    ...(environment ? { environment } : {}),
    tokenCiphertext: encryptToBase64(token),
    encryption: 'electron.safeStorage',
    createdAt: prev?.createdAt ?? now,
    updatedAt: now,
  };
  // New profiles become active by default (product behavior).
  if (!payload.activeProfileIdByProvider) payload.activeProfileIdByProvider = {};
  payload.activeProfileIdByProvider[provider] = profileId;
  await writePayloadV2(payload);
  return { profileId };
}

export async function updateAuthProfileMeta(params: {
  provider: string;
  profileId: string;
  label?: string;
  environment?: 'personal' | 'work' | 'custom';
}): Promise<{ success: boolean }> {
  const provider = String(params.provider ?? '').trim();
  const profileId = String(params.profileId ?? '').trim();
  const label = typeof params.label === 'string' ? params.label.trim() : '';
  const environment =
    params.environment === 'personal' || params.environment === 'work' || params.environment === 'custom'
      ? params.environment
      : undefined;
  if (!provider) throw new Error('Missing provider');
  if (!profileId) throw new Error('Missing profileId');

  const payload = await ensurePayloadV2();
  const prev = payload.profiles[profileId];
  if (!prev || prev.provider !== provider) throw new Error('Profile not found');

  payload.profiles[profileId] = {
    ...prev,
    ...(label ? { label } : {}),
    ...(environment ? { environment } : {}),
    updatedAt: Date.now(),
  };
  await writePayloadV2(payload);
  return { success: true };
}

export async function removeAuthProfile(params: { provider: string; profileId?: string }): Promise<{ removed: boolean }> {
  const provider = String(params.provider ?? '').trim();
  const profileId = String(params.profileId ?? '').trim();
  if (!provider) throw new Error('Missing provider');
  if (!profileId) throw new Error('Missing profileId');
  const payload = await ensurePayloadV2();
  const existed = Boolean(payload.profiles[profileId]);
  if (existed) {
    delete payload.profiles[profileId];
    if (payload.activeProfileIdByProvider?.[provider] === profileId) {
      // pick another profile of same provider, or unset
      const next = Object.values(payload.profiles).find((p) => p?.provider === provider)?.profileId ?? '';
      if (!payload.activeProfileIdByProvider) payload.activeProfileIdByProvider = {};
      if (next) payload.activeProfileIdByProvider[provider] = next;
      else delete payload.activeProfileIdByProvider[provider];
    }
    await writePayloadV2(payload);
  }
  return { removed: existed };
}

export async function setActiveAuthProfile(params: {
  provider: string;
  profileId: string;
}): Promise<{ success: boolean }> {
  const provider = String(params.provider ?? '').trim();
  const profileId = String(params.profileId ?? '').trim();
  if (!provider) throw new Error('Missing provider');
  if (!profileId) throw new Error('Missing profileId');
  const payload = await ensurePayloadV2();
  const entry = payload.profiles[profileId];
  if (!entry || entry.provider !== provider) throw new Error('Profile not found');
  if (!payload.activeProfileIdByProvider) payload.activeProfileIdByProvider = {};
  payload.activeProfileIdByProvider[provider] = profileId;
  await writePayloadV2(payload);
  return { success: true };
}

export async function getActiveAuthProfileId(provider: string): Promise<string | null> {
  const p = String(provider ?? '').trim();
  if (!p) return null;
  const payload = await ensurePayloadV2();
  const pid = payload.activeProfileIdByProvider?.[p] ?? '';
  return pid ? pid : null;
}

export async function getAuthToken(provider: string, profileId?: string): Promise<string | null> {
  const p = String(provider ?? '').trim();
  if (!p) return null;
  const payload = await ensurePayloadV2();
  const pid =
    String(profileId ?? '').trim() ||
    String(payload.activeProfileIdByProvider?.[p] ?? '').trim() ||
    `${p}:manual`;
  if (!pid) return null;
  const entry = payload.profiles[pid];
  if (!entry || entry.provider !== p) return null;
  try {
    const plain = decryptFromBase64(entry.tokenCiphertext);
    const t = String(plain ?? '').trim();
    return t ? t : null;
  } catch {
    return null;
  }
}

export async function listAuthProfiles(): Promise<AuthProfile[]> {
  const payload = await ensurePayloadV2();
  return Object.values(payload.profiles ?? {}).filter(Boolean);
}

export async function getAuthStoreSummary(): Promise<{
  version: 2;
  profiles: Array<Omit<AuthProfile, 'tokenCiphertext'>>;
  activeProfileIdByProvider: Record<string, string>;
}> {
  const payload = await ensurePayloadV2();
  const profiles = Object.values(payload.profiles ?? {})
    .filter(Boolean)
    .map((p) => {
      const { tokenCiphertext: _t, ...rest } = p;
      return rest;
    });
  return {
    version: 2,
    profiles,
    activeProfileIdByProvider: (payload.activeProfileIdByProvider ?? {}) as Record<string, string>,
  };
}

