/**
 * 引擎运行时偏好（userData）：工具循环上限、连续发送合并窗口等。
 */

import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';

export const DEFAULT_MAX_SEND_MESSAGE_TOOL_LOOP_STEPS = 9;
export const MIN_MAX_SEND_MESSAGE_TOOL_LOOP_STEPS = 1;
export const MAX_MAX_SEND_MESSAGE_TOOL_LOOP_STEPS = 24;

/** 连续发送在此时间窗内则合并并取消当前模型请求（毫秒） */
export const DEFAULT_OUTBOUND_MERGE_WINDOW_MS = 3000;
export const MIN_OUTBOUND_MERGE_WINDOW_MS = 500;
export const MAX_OUTBOUND_MERGE_WINDOW_MS = 60_000;

export type EngineRuntimePrefsStored = {
  maxSendMessageToolLoopSteps?: number;
  outboundMergeWindowMs?: number;
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

export function resolveOutboundMergeWindowMs(prefs?: EngineRuntimePrefsStored | null): number {
  const n = prefs?.outboundMergeWindowMs;
  if (typeof n === 'number' && Number.isFinite(n)) {
    return Math.min(MAX_OUTBOUND_MERGE_WINDOW_MS, Math.max(MIN_OUTBOUND_MERGE_WINDOW_MS, Math.floor(n)));
  }
  return DEFAULT_OUTBOUND_MERGE_WINDOW_MS;
}
