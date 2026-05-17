/**
 * 预期规划 Agent：M3/M4 发送主对话前的任务编排（Plan + JSON，不写入会话存储）。
 */

import type { ProviderRouter } from '../../engine/provider-router';
import type { ModelProvider } from '../../engine/providers/provider';
import type { ChatCompletionRequest, ModeConfig } from '../../engine/providers/types';
import { buildModeConfig } from '../../engine/mode-policy';
import { resolveModelIdForInteractionMode } from '../../engine/mode-defaults';
import { mergeCompletionReasoning } from '../../utils/split-reasoning-from-content';
import {
  buildExpectationPlanningUserMessage,
  buildExpectationPlanContextForMainAgent,
  formatExpectationPlanMarkdown,
  parseExpectationPlanResponse,
  type ExpectationPlan,
} from '../../shared/expectation-plan';
import { buildSystemSubAgentRoleSystemContent } from './system-agent-role-bootstrap';
import { EXPECTATION_PLANNING_AGENT_SLOT_ID } from '../../shared/system-agent-constants';
import type { SystemAgentSettings } from '../../shared/system-agent-settings';
import { readSystemAgentSettings } from './system-agent-settings-service';

export type ExpectationPlanningRunResult = {
  raw: string;
  plan: ExpectationPlan | null;
  displayMarkdown: string;
  contextForMain: string | null;
  fallback?: boolean;
};

export async function runExpectationPlanning(params: {
  userText: string;
  categoryLabel?: string;
  classificationSummary?: string;
  modelId?: string;
  abortSignal?: AbortSignal;
  router: ProviderRouter;
  settings?: SystemAgentSettings;
  onDelta?: (chunk: string) => void;
}): Promise<ExpectationPlanningRunResult> {
  const userText = String(params.userText ?? '').trim();
  const empty: ExpectationPlanningRunResult = {
    raw: '',
    plan: null,
    displayMarkdown: '',
    contextForMain: null,
    fallback: true,
  };
  if (!userText) return empty;

  const settings = params.settings ?? (await readSystemAgentSettings());
  if (!settings.expectationPlanningEnabled) return empty;

  const modelId = resolveModelIdForInteractionMode(
    'plan',
    settings.expectationPlanningModelId.trim() || params.modelId
  );
  const providerId = params.router.resolveProviderIdFromModelId(modelId);
  const provider: ModelProvider | null = providerId ? params.router.get(providerId) : null;
  if (!provider || !providerId) return empty;

  const baseModeConfig = buildModeConfig({ mode: 'plan', intent: 'strong' });
  const modeConfig: ModeConfig = {
    ...baseModeConfig,
    jsonMode: true,
    toolsEnabled: false,
    tools: undefined,
  };

  const systemContent = await buildSystemSubAgentRoleSystemContent('expectation-planning');
  const req: ChatCompletionRequest = {
    model: modelId,
    messages: [
      { role: 'system', content: systemContent },
      {
        role: 'user',
        content: buildExpectationPlanningUserMessage({
          userText,
          categoryLabel: params.categoryLabel,
          classificationSummary: params.classificationSummary,
        }),
      },
    ],
    modeConfig,
  };

  let raw = '';
  try {
    if (typeof provider.streamChatCompletion === 'function' && params.onDelta) {
      const res = await provider.streamChatCompletion(req, (d) => {
        const chunk = String(d ?? '');
        if (!chunk) return;
        raw += chunk;
        params.onDelta?.(chunk);
      }, { signal: params.abortSignal });
      const merged = mergeCompletionReasoning(res.content || raw, res.reasoning_content);
      raw = merged.displayContent.trim() || merged.reasoningCombined.trim() || raw.trim();
    } else {
      const res = await provider.chatCompletion(req, { signal: params.abortSignal });
      const merged = mergeCompletionReasoning(res.content, res.reasoning_content);
      raw = merged.displayContent.trim() || merged.reasoningCombined.trim();
      if (raw && params.onDelta) params.onDelta(raw);
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(`[${EXPECTATION_PLANNING_AGENT_SLOT_ID}] planning failed:`, msg);
    return empty;
  }

  const { plan } = parseExpectationPlanResponse(raw);
  const displayMarkdown = plan ? formatExpectationPlanMarkdown(plan) : raw;
  const contextForMain = plan || raw.trim() ? buildExpectationPlanContextForMainAgent(plan ?? raw) : null;

  return {
    raw,
    plan,
    displayMarkdown,
    contextForMain,
    fallback: !plan,
  };
}
