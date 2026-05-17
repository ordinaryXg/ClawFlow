/**
 * 认知分配 Agent：主对话发送前的模式分类（Ask + JSON）。
 * 角色提示词见应用缓存 `system/.subagent-roles/cognitive-allocation/`（AGENTS.md + SOUL.md + TOOLS.md）。
 */

import type { ProviderRouter } from '../../engine/provider-router';
import type { ModelProvider } from '../../engine/providers/provider';
import type { ChatCompletionRequest, ModeConfig } from '../../engine/providers/types';
import { buildModeConfig } from '../../engine/mode-policy';
import { resolveModelIdForInteractionMode } from '../../engine/mode-defaults';
import { mergeCompletionReasoning } from '../../utils/split-reasoning-from-content';
import {
  buildConversationModeClassifierUserMessage,
  heuristicConversationModeClassification,
  parseClassificationResponse,
  type ConversationModeClassification,
} from '../../engine/conversation-mode-classifier';
import { buildSystemSubAgentRoleSystemContent } from './system-agent-role-bootstrap';
import { COGNITIVE_ALLOCATION_AGENT_SLOT_ID } from '../../shared/system-agent-constants';
import type { SystemAgentSettings } from '../../shared/system-agent-settings';
import { readSystemAgentSettings } from './system-agent-settings-service';

export async function runCognitiveAllocationClassification(params: {
  userText: string;
  modelId?: string;
  abortSignal?: AbortSignal;
  router: ProviderRouter;
  settings?: SystemAgentSettings;
}): Promise<ConversationModeClassification> {
  const userText = String(params.userText ?? '').trim();
  if (!userText) return heuristicConversationModeClassification('');

  const settings = params.settings ?? (await readSystemAgentSettings());
  if (!settings.cognitiveAllocationEnabled) {
    return heuristicConversationModeClassification(userText);
  }

  const modelId = resolveModelIdForInteractionMode(
    'ask',
    settings.cognitiveAllocationModelId.trim() || params.modelId
  );
  const providerId = params.router.resolveProviderIdFromModelId(modelId);
  const provider: ModelProvider | null = providerId ? params.router.get(providerId) : null;
  if (!provider || !providerId) return heuristicConversationModeClassification(userText);

  const baseModeConfig = buildModeConfig({ mode: 'ask', intent: 'strong' });
  const modeConfig: ModeConfig = {
    ...baseModeConfig,
    jsonMode: true,
    toolsEnabled: false,
    tools: undefined,
  };

  const systemContent = await buildSystemSubAgentRoleSystemContent('cognitive-allocation');
  const req: ChatCompletionRequest = {
    model: modelId,
    messages: [
      { role: 'system', content: systemContent },
      { role: 'user', content: buildConversationModeClassifierUserMessage(userText) },
    ],
    modeConfig,
  };

  try {
    const res = await provider.chatCompletion(req, { signal: params.abortSignal });
    const merged = mergeCompletionReasoning(res.content, res.reasoning_content);
    const raw = merged.displayContent.trim() || merged.reasoningCombined.trim();
    const parsed = parseClassificationResponse(raw);
    if (parsed) return parsed;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(`[${COGNITIVE_ALLOCATION_AGENT_SLOT_ID}] classification failed:`, msg);
  }

  return heuristicConversationModeClassification(userText);
}
