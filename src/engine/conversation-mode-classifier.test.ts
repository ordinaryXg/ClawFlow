import type { ProviderRouter } from './provider-router';
import type { ModelProvider } from './providers/provider';
import { runCognitiveAllocationClassification } from '../main/system-agents/cognitive-allocation-agent';
import { buildCognitiveAllocationSystemPrompt } from '../main/system-agents/system-agent-role-bootstrap';

function mockRouter(provider: ModelProvider | null, providerId = 'deepseek'): ProviderRouter {
  return {
    resolveProviderIdFromModelId: () => (provider ? providerId : null),
    get: (id: string) => (id === providerId ? provider : null),
  } as unknown as ProviderRouter;
}

describe('buildCognitiveAllocationSystemPrompt', () => {
  it('includes classifier methodology from agent role bundle', async () => {
    const prompt = await buildCognitiveAllocationSystemPrompt();
    expect(prompt).toContain('conversation-mode classifier');
    expect(prompt).toContain('Output contract');
    expect(prompt).toContain('M1');
  });
});

describe('runCognitiveAllocationClassification', () => {
  it('parses model JSON via cognitive allocation agent', async () => {
    const provider: ModelProvider = {
      chatCompletion: jest.fn().mockResolvedValue({
        content: '{"category":"e","summary":"多步骤改造"}',
        reasoning_content: '',
      }),
    } as unknown as ModelProvider;

    const result = await runCognitiveAllocationClassification({
      userText: '请分阶段重构认证模块并跑测试',
      router: mockRouter(provider),
    });

    expect(result.category).toBe('e');
    expect(result.mode).toBe('multitask');
    expect(result.fallback).toBeUndefined();
    expect(provider.chatCompletion).toHaveBeenCalledTimes(1);
    const req = (provider.chatCompletion as jest.Mock).mock.calls[0][0];
    expect(req.modeConfig?.jsonMode).toBe(true);
    expect(req.modeConfig?.toolsEnabled).toBe(false);
    expect(String(req.messages[0].content)).toContain('conversation-mode classifier');
  });

  it('falls back heuristically when provider missing', async () => {
    const result = await runCognitiveAllocationClassification({
      userText: '你好',
      router: mockRouter(null),
    });
    expect(result.category).toBe('a');
    expect(result.fallback).toBe(true);
  });

  it('falls back when model output is invalid', async () => {
    const provider: ModelProvider = {
      chatCompletion: jest.fn().mockResolvedValue({ content: 'not json', reasoning_content: '' }),
    } as unknown as ModelProvider;

    const result = await runCognitiveAllocationClassification({
      userText: '运行 npm test',
      router: mockRouter(provider),
    });
    expect(result.fallback).toBe(true);
  });
});
