import { apiModelFromClawId } from './model-id';

describe('apiModelFromClawId', () => {
  it('strips provider/model prefix', () => {
    expect(apiModelFromClawId('deepseek/deepseek-chat')).toBe('deepseek-chat');
    expect(apiModelFromClawId('openai/gpt-4o-mini')).toBe('gpt-4o-mini');
  });

  it('returns unchanged when no slash', () => {
    expect(apiModelFromClawId('gpt-4o')).toBe('gpt-4o');
    expect(apiModelFromClawId('')).toBe('');
  });
});
