import * as fs from 'fs';
import * as path from 'path';
import {
  DEFAULT_SYSTEM_AGENT_SETTINGS,
  type SystemAgentSettings,
} from '../../shared/system-agent-settings';
import { systemClawflowDirAbs } from './system-agent-layout';

const FILE_VERSION = 1 as const;
const FILENAME = 'system-agent-settings.v1.json';

type FileShape = { version: typeof FILE_VERSION; settings: Partial<SystemAgentSettings> };

function settingsPath(): string {
  return path.join(systemClawflowDirAbs(), FILENAME);
}

export function normalizeSystemAgentSettings(raw: Partial<SystemAgentSettings> | null | undefined): SystemAgentSettings {
  const d = DEFAULT_SYSTEM_AGENT_SETTINGS;
  const src = raw && typeof raw === 'object' ? raw : {};
  return {
    cognitiveAllocationEnabled:
      typeof src.cognitiveAllocationEnabled === 'boolean' ? src.cognitiveAllocationEnabled : d.cognitiveAllocationEnabled,
    cognitiveAllocationModelId:
      typeof src.cognitiveAllocationModelId === 'string' ? src.cognitiveAllocationModelId.trim() : d.cognitiveAllocationModelId,
    showModeClassificationDebug:
      typeof src.showModeClassificationDebug === 'boolean'
        ? src.showModeClassificationDebug
        : d.showModeClassificationDebug,
  };
}

export async function readSystemAgentSettings(): Promise<SystemAgentSettings> {
  try {
    const buf = await fs.promises.readFile(settingsPath(), 'utf-8');
    const parsed = JSON.parse(buf) as FileShape;
    if (parsed?.settings && typeof parsed.settings === 'object') {
      return normalizeSystemAgentSettings(parsed.settings);
    }
  } catch {
    /* missing */
  }
  return { ...DEFAULT_SYSTEM_AGENT_SETTINGS };
}

export async function writeSystemAgentSettings(patch: Partial<SystemAgentSettings>): Promise<SystemAgentSettings> {
  const prev = await readSystemAgentSettings();
  const next = normalizeSystemAgentSettings({ ...prev, ...patch });
  await fs.promises.mkdir(systemClawflowDirAbs(), { recursive: true });
  const body: FileShape = { version: FILE_VERSION, settings: next };
  await fs.promises.writeFile(settingsPath(), JSON.stringify(body, null, 2), 'utf-8');
  return next;
}
