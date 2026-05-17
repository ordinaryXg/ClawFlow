import { BUILTIN_MODEL_ID_BY_MODE, resolveModelIdForInteractionMode } from './mode-defaults';

describe('resolveModelIdForInteractionMode', () => {
  it('binds deepseek catalog models to mode defaults', () => {
    expect(resolveModelIdForInteractionMode('ask', null)).toBe(BUILTIN_MODEL_ID_BY_MODE.ask);
    expect(resolveModelIdForInteractionMode('plan', 'deepseek/deepseek-v4-pro')).toBe(BUILTIN_MODEL_ID_BY_MODE.plan);
    expect(resolveModelIdForInteractionMode('multitask', 'deepseek/deepseek-v4-flash')).toBe(
      BUILTIN_MODEL_ID_BY_MODE.multitask
    );
  });

  it('keeps non-deepseek explicit model', () => {
    expect(resolveModelIdForInteractionMode('plan', 'openai/gpt-4o')).toBe('openai/gpt-4o');
  });
});
