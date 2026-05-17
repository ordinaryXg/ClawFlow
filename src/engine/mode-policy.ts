import type { ModeConfig, InteractionMode } from './providers/types';

export type ChatIntent = 'fast' | 'strong' | 'cheap';

export type AutoPick = { pickedMode: InteractionMode; reason: string };

export type ModePolicyOverrides = Partial<
  Pick<ModeConfig, 'thinking' | 'reasoning_effort' | 'jsonMode' | 'useBetaBaseUrl' | 'toolsEnabled'>
>;

export function defaultModeConfig(mode: InteractionMode): ModeConfig {
  if (mode === 'ask') {
    return { mode, thinking: { type: 'disabled' } };
  }
  if (mode === 'plan') {
    return { mode, thinking: { type: 'enabled' }, reasoning_effort: 'high' };
  }
  return { mode, thinking: { type: 'enabled' }, reasoning_effort: 'max' };
}

export function applyIntentPreset(mode: InteractionMode, intent: ChatIntent): ModeConfig {
  const base = defaultModeConfig(mode);
  if (intent === 'strong') return base;
  if (intent === 'fast') {
    return { ...base, thinking: { type: 'disabled' }, reasoning_effort: undefined };
  }
  // cheap：Ask 仍关闭思考；Plan 保持 high；Multitask 降为 high
  if (mode === 'ask') {
    return { ...base, thinking: { type: 'disabled' }, reasoning_effort: undefined };
  }
  if (mode === 'plan') {
    return { ...base, thinking: { type: 'enabled' }, reasoning_effort: 'high' };
  }
  return { ...base, thinking: { type: 'enabled' }, reasoning_effort: 'high' };
}

export function buildModeConfig(params: {
  mode: InteractionMode;
  intent?: ChatIntent;
  overrides?: ModePolicyOverrides;
}): ModeConfig {
  const intent = params.intent ?? 'strong';
  const cfg: ModeConfig = applyIntentPreset(params.mode, intent);

  const overrides = params.overrides ?? {};
  if (overrides.thinking) cfg.thinking = overrides.thinking;
  if (overrides.reasoning_effort) cfg.reasoning_effort = overrides.reasoning_effort;
  if (typeof overrides.jsonMode === 'boolean') cfg.jsonMode = overrides.jsonMode;
  if (typeof overrides.useBetaBaseUrl === 'boolean') cfg.useBetaBaseUrl = overrides.useBetaBaseUrl;

  const defaultToolsEnabled = params.mode === 'multitask' || params.mode === 'plan';
  cfg.toolsEnabled =
    typeof overrides.toolsEnabled === 'boolean' ? overrides.toolsEnabled : defaultToolsEnabled;
  return cfg;
}

export function autoPickMode(text: string): AutoPick {
  const t = String(text ?? '').trim();
  const lower = t.toLowerCase();
  const len = t.length;

  const hasPlanningSignals =
    /步骤|计划|方案|对比|权衡|取舍|设计|架构|roadmap|plan|tradeoff|compare|pros|cons/i.test(t);
  const hasActionSignals =
    /运行|执行|搜索|查找|改|修改|重构|提交|commit|git\s|rg\s|diff|log|grep|build|test/i.test(t);

  if (hasActionSignals) {
    return { pickedMode: 'multitask', reason: '检测到执行/改动/搜索相关意图，自动选择 Multitask。' };
  }
  if (hasPlanningSignals || len > 220) {
    return { pickedMode: 'plan', reason: '检测到规划/对比/较长输入，自动选择 Plan。' };
  }
  if (len <= 120) {
    return { pickedMode: 'ask', reason: '较短、偏问答类输入，自动选择 Ask。' };
  }
  return { pickedMode: 'plan', reason: '默认选择 Plan。' };
}

