import type { ConversationModeClassification } from '../../../engine/mode/conversation-mode-classifier';
import { heuristicConversationModeClassification } from '../../../engine/mode/conversation-mode-classifier';
import { needsExpectationPlanning } from '../../../shared/expectation-plan';
import { ReasoningStreamDemux } from '../../../utils/reasoning-stream-demux';
import {
  pickRunningToolHints,
  sanitizeStreamActivityForDisplay,
  type StreamToolHint,
} from '../../../utils/stream-activity-sanitize';
import { getPendingSends } from '../chat-outbound-orchestrator';
import type { ChatState } from './chat-store-types';

export async function classifyConversationForSend(
  content: string,
  modelId?: string | null
): Promise<ConversationModeClassification> {
  try {
    const res = await window.electronAPI?.systemAgentsClassifyConversation?.({
      userText: content,
      ...(modelId ? { modelId } : {}),
    });
    if (res && 'ok' in res && res.ok) {
      const { ok: _ok, ...classification } = res;
      return classification;
    }
  } catch {
    /* fallback below */
  }
  return heuristicConversationModeClassification(content);
}

export async function planExpectationForSend(
  content: string,
  classification: ConversationModeClassification,
  modelId: string | null | undefined,
  onDelta: (accumulated: string) => void
): Promise<{ contextForMain: string | null; displayMarkdown: string } | null> {
  if (!needsExpectationPlanning(classification.category)) return null;
  try {
    let accumulated = '';
    const res = await window.electronAPI?.systemAgentsPlanExpectation?.(
      {
        userText: content,
        categoryLabel: classification.categoryLabel,
        classificationSummary: classification.summary,
        ...(modelId ? { modelId } : {}),
      },
      (chunk) => {
        accumulated += chunk;
        onDelta(accumulated);
      }
    );
    if (res && 'ok' in res && res.ok) {
      const display = String(res.displayMarkdown ?? '').trim() || accumulated.trim();
      const ctx = typeof res.contextForMain === 'string' && res.contextForMain.trim() ? res.contextForMain : null;
      return { contextForMain: ctx, displayMarkdown: display };
    }
  } catch {
    /* skip planning */
  }
  return null;
}

export function streamingFromDemuxer(demuxer: ReasoningStreamDemux): {
  streamingActivity: string | null;
  streamingToolHints: StreamToolHint[];
} {
  const sanitized = sanitizeStreamActivityForDisplay(demuxer.getActivity());
  const text = sanitized.text.trim();
  return {
    streamingActivity: text ? sanitized.text : null,
    streamingToolHints: pickRunningToolHints(sanitized.toolHints),
  };
}

export function clearStreamingState(): Pick<ChatState, 'streamingActivity' | 'streamingThinking' | 'streamingToolHints'> {
  return { streamingActivity: null, streamingThinking: null, streamingToolHints: [] };
}

let revealCleanup: (() => void) | null = null;

export function cancelAssistantReveal() {
  revealCleanup?.();
  revealCleanup = null;
}

export function setRevealCleanup(cleanup: (() => void) | null) {
  revealCleanup = cleanup;
}

const TOOL_CONV_SYNC_MIN_MS = 300;
let lastToolConvSyncTs = 0;

const FETCH_CONVERSATIONS_DEBOUNCE_MS = 600;
let fetchConversationsTimer: ReturnType<typeof setTimeout> | null = null;

export function scheduleFetchConversations(
  getState: () => { fetchConversations: (opts?: { immediate?: boolean }) => Promise<void> },
  opts?: { immediate?: boolean }
): void {
  if (opts?.immediate) {
    if (fetchConversationsTimer) {
      clearTimeout(fetchConversationsTimer);
      fetchConversationsTimer = null;
    }
    void getState()
      .fetchConversations({ immediate: true })
      .catch(() => undefined);
    return;
  }
  if (fetchConversationsTimer) clearTimeout(fetchConversationsTimer);
  fetchConversationsTimer = setTimeout(() => {
    fetchConversationsTimer = null;
    void getState()
      .fetchConversations({ immediate: true })
      .catch(() => undefined);
  }, FETCH_CONVERSATIONS_DEBOUNCE_MS);
}

export function scheduleSyncConversationsAfterTool(getState: () => { fetchConversations: (opts?: { immediate?: boolean }) => Promise<void> }): void {
  const now = Date.now();
  if (now - lastToolConvSyncTs < TOOL_CONV_SYNC_MIN_MS) return;
  lastToolConvSyncTs = now;
  scheduleFetchConversations(getState);
}

export function syncPendingSendQueueToStore(
  set: (partial: Partial<ChatState> | ((s: ChatState) => Partial<ChatState>)) => void,
  conversationId: string | null
) {
  const items = conversationId ? getPendingSends(conversationId) : [];
  set({
    pendingSendQueue: items.map(({ id, content, enqueuedAt }) => ({ id, content, enqueuedAt })),
  });
}
