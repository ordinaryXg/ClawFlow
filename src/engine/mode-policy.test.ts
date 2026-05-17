import { buildModeConfig, defaultModeConfig } from './mode-policy';

describe('defaultModeConfig', () => {
  it('ask disables thinking', () => {
    expect(defaultModeConfig('ask')).toMatchObject({ thinking: { type: 'disabled' } });
    expect(defaultModeConfig('ask').reasoning_effort).toBeUndefined();
  });

  it('plan uses high reasoning', () => {
    expect(defaultModeConfig('plan')).toMatchObject({
      thinking: { type: 'enabled' },
      reasoning_effort: 'high',
    });
  });

  it('multitask uses max reasoning', () => {
    expect(defaultModeConfig('multitask')).toMatchObject({
      thinking: { type: 'enabled' },
      reasoning_effort: 'max',
    });
  });
});

describe('buildModeConfig strong intent', () => {
  it('plan and multitask enable tools by default', () => {
    expect(buildModeConfig({ mode: 'ask', intent: 'strong' }).toolsEnabled).toBe(false);
    expect(buildModeConfig({ mode: 'plan', intent: 'strong' }).toolsEnabled).toBe(true);
    expect(buildModeConfig({ mode: 'multitask', intent: 'strong' }).toolsEnabled).toBe(true);
  });
});
