import type { InteractionMode } from './providers/types';

/** 内置 DeepSeek 对话：各交互模式绑定的 catalog model id */
export const BUILTIN_MODEL_ID_BY_MODE: Record<InteractionMode, string> = {
  ask: 'deepseek/deepseek-v4-flash',
  plan: 'deepseek/deepseek-v4-flash',
  multitask: 'deepseek/deepseek-v4-pro',
};

export function isDeepSeekBuiltinChatModelId(modelId: string): boolean {
  return String(modelId ?? '').trim().startsWith('deepseek/');
}

/** 按模式解析实际下发模型：未指定或非 DeepSeek 目录模型时沿用显式选择；DeepSeek 目录内由模式绑定。 */
export function resolveModelIdForInteractionMode(
  mode: InteractionMode,
  explicitModelId?: string | null
): string {
  const modeDefault = BUILTIN_MODEL_ID_BY_MODE[mode] ?? BUILTIN_MODEL_ID_BY_MODE.ask;
  const explicit = String(explicitModelId ?? '').trim();
  if (!explicit) return modeDefault;
  if (isDeepSeekBuiltinChatModelId(explicit)) return modeDefault;
  return explicit;
}

export function builtinModelIdForInteractionMode(mode: InteractionMode): string {
  return BUILTIN_MODEL_ID_BY_MODE[mode] ?? BUILTIN_MODEL_ID_BY_MODE.ask;
}
