import * as fs from 'fs';
import * as path from 'path';
import { globalClawflowRoot } from '../workspace-service';

export type AuthProfile = {
  provider: string;
  profileId: string;
  label?: string;
  token: string;
  createdAt: number;
  updatedAt: number;
};

type AuthStorePayload = {
  version: 1;
  profiles: Record<string, AuthProfile>;
};

const STORE_FILE = 'auth-profiles.v1.json';

function storePath(): string {
  return path.join(globalClawflowRoot(), STORE_FILE);
}

async function readPayload(): Promise<AuthStorePayload> {
  try {
    const raw = await fs.promises.readFile(storePath(), 'utf-8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && parsed.version === 1 && parsed.profiles && typeof parsed.profiles === 'object') {
      return parsed as AuthStorePayload;
    }
  } catch {
    // ignore
  }
  return { version: 1, profiles: {} };
}

async function writePayload(payload: AuthStorePayload): Promise<void> {
  await fs.promises.mkdir(path.dirname(storePath()), { recursive: true });
  await fs.promises.writeFile(storePath(), JSON.stringify(payload, null, 2), 'utf-8');
}

export async function upsertAuthProfile(params: {
  provider: string;
  token: string;
  profileId?: string;
  label?: string;
}): Promise<{ profileId: string }> {
  const provider = String(params.provider ?? '').trim();
  const token = String(params.token ?? '').trim();
  const profileId = String(params.profileId ?? `${provider}:manual`).trim();
  const label = typeof params.label === 'string' ? params.label.trim() : '';
  if (!provider) throw new Error('Missing provider');
  if (!token) throw new Error('Missing token');
  if (!profileId) throw new Error('Missing profileId');

  const now = Date.now();
  const payload = await readPayload();
  const prev = payload.profiles[profileId];
  payload.profiles[profileId] = {
    provider,
    profileId,
    token,
    ...(label ? { label } : {}),
    createdAt: prev?.createdAt ?? now,
    updatedAt: now,
  };
  await writePayload(payload);
  return { profileId };
}

export async function removeAuthProfile(params: { provider: string; profileId?: string }): Promise<{ removed: boolean }> {
  const provider = String(params.provider ?? '').trim();
  const profileId = String(params.profileId ?? `${provider}:manual`).trim();
  if (!provider) throw new Error('Missing provider');
  if (!profileId) throw new Error('Missing profileId');
  const payload = await readPayload();
  const existed = Boolean(payload.profiles[profileId]);
  if (existed) {
    delete payload.profiles[profileId];
    await writePayload(payload);
  }
  return { removed: existed };
}

export async function getAuthToken(provider: string, profileId?: string): Promise<string | null> {
  const p = String(provider ?? '').trim();
  const pid = String(profileId ?? `${p}:manual`).trim();
  if (!p || !pid) return null;
  const payload = await readPayload();
  const entry = payload.profiles[pid];
  if (!entry || entry.provider !== p) return null;
  const t = String(entry.token ?? '').trim();
  return t ? t : null;
}

export async function listAuthProfiles(): Promise<AuthProfile[]> {
  const payload = await readPayload();
  return Object.values(payload.profiles ?? {}).filter(Boolean);
}

