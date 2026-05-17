/**
 * 引擎运行时偏好（userData）：如 Multitask/Plan 单次 sendMessage 内工具循环轮次上限。
 */

import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';

export const DEFAULT_MAX_SEND_MESSAGE_TOOL_LOOP_STEPS = 9;
export const MIN_MAX_SEND_MESSAGE_TOOL_LOOP_STEPS = 1;
export const MAX_MAX_SEND_MESSAGE_TOOL_LOOP_STEPS = 24;

export type EngineRuntimePrefsStored = {
  maxSendMessageToolLoopSteps?: number;
};

const FILENAME = 'cf.engine-runtime-prefs.json';

function filePath(): string {
  return path.join(app.getPath('userData'), FILENAME);
}

export function readEngineRuntimePrefsFile(): EngineRuntimePrefsStored | null {
  try {
    const raw = fs.readFileSync(filePath(), 'utf-8');
    const j = JSON.parse(raw) as EngineRuntimePrefsStored;
    if (!j || typeof j !== 'object') return null;
    return j;
  } catch {
    return null;
  }
}

export function writeEngineRuntimePrefsFile(prefs: EngineRuntimePrefsStored): void {
  fs.mkdirSync(path.dirname(filePath()), { recursive: true });
  fs.writeFileSync(filePath(), JSON.stringify(prefs, null, 2), 'utf-8');
}

export function resolveMaxSendMessageToolLoopSteps(prefs?: EngineRuntimePrefsStored | null): number {
  const n = prefs?.maxSendMessageToolLoopSteps;
  if (typeof n === 'number' && Number.isFinite(n)) {
    return Math.min(
      MAX_MAX_SEND_MESSAGE_TOOL_LOOP_STEPS,
      Math.max(MIN_MAX_SEND_MESSAGE_TOOL_LOOP_STEPS, Math.floor(n))
    );
  }
  return DEFAULT_MAX_SEND_MESSAGE_TOOL_LOOP_STEPS;
}
