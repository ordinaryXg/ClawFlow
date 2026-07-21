import { v4 as uuidv4 } from 'uuid';
import { resolveModelIdForInteractionMode } from '../../../engine/mode/mode-defaults';
import type { ConversationModeClassification } from '../../../engine/mode/conversation-mode-classifier';
import { needsExpectationPlanning } from '../../../shared/expectation-plan';
import { logChatSendRenderer } from '../../../shared/chat-send-debug';
import {
  finishOutboundTurn,
  getMergedOutboundText,
  startOutboundTurnFromPending,
  takePendingSends,
  type OutboundTurn,
} from '../chat-outbound-orchestrator';
import { ReasoningStreamDemux } from '../../../utils/reasoning-stream-demux';
import { useSettingsStore } from '../settingsStore';
import { useScheduleTriggerStore } from '../scheduleTriggerStore';
import { normalizeWorkspacePathForCompare as normWorkspacePath } from '../../../shared/workspace-path-compare';
import {
  ensureGatewayWs,
  registerGatewayPendingRequest,
  sendGatewayChatMessage,
  shouldUseGatewayChatTransport,
  type GatewayWsSend,
} from '../chat-gateway-client';
import type { ChatState, Message } from './chat-store-types';
import { conversationForEngineUpsert } from './chat-store-normalize';
import {
  cancelAssistantReveal,
  classifyConversationForSend,
  clearStreamingState,
  planExpectationForSend,
  scheduleSyncConversationsAfterTool,
  setRevealCleanup,
  streamingFromDemuxer,
  syncPendingSendQueueToStore,
} from './chat-store-internals';

export type OutboundTurnExecutor = (turn: OutboundTurn) => Promise<void>;

export function createOutboundTurnExecutor(
  set: (partial: Partial<ChatState> | ((s: ChatState) => Partial<ChatState>)) => void,
  get: () => ChatState
): OutboundTurnExecutor {
  const executeOutboundTurn: OutboundTurnExecutor = async (turn) => {
      const sessionId = turn.conversationId;
      const generation = turn.generation;
      const mergedContent = getMergedOutboundText(turn);
      const effectiveModelIdParam = turn.modelId;
      const scheduleReceiptTriggerId = turn.opts?.scheduleFireReceipt?.triggerId?.trim() ?? null;
      const abortSignal = turn.abortController.signal;

      const flushPendingAfterTurn = async () => {
        const pending = takePendingSends(sessionId);
        syncPendingSendQueueToStore(set, sessionId);
        if (!pending.length) return;
        const nextTurn = startOutboundTurnFromPending(sessionId, pending);
        await executeOutboundTurn(nextTurn);
      };

      cancelAssistantReveal();
      set({ streamingActivity: '', streamingToolHints: [], streamingThinking: null, isLoading: true });

      try {
        const t0 = performance.now();
        const engineOwnsPersist = shouldUseGatewayChatTransport();

        const finalizeReply = async (
          fullText: string,
          log?: { ipcMs: number; label: string },
          reasoningText?: string | null
        ) => {
          if (!finishOutboundTurn(sessionId, generation)) return;

          set({
            isLoading: false,
            ...clearStreamingState(),
          });

          const assistantText = String(fullText ?? '');
          const assistantReasoning = String(reasoningText ?? '').trim();
          if (assistantText.trim()) {
            const nowTs = Date.now();
            const msg: Message = {
              id: uuidv4(),
              role: 'assistant',
              content: assistantText,
              timestamp: nowTs,
              ...(assistantReasoning ? { reasoningContent: assistantReasoning } : {}),
            };
            set((state) => {
              const nextConvs = state.conversations.map((c) => {
                if (c.id !== sessionId) return c;
                const last = c.messages[c.messages.length - 1];
                const dup = last?.role === 'assistant' && String(last.content ?? '') === assistantText;
                if (dup) return c;
                return { ...c, messages: [...c.messages, msg], updatedAt: nowTs };
              });
              const active = state.activeConversationId === sessionId;
              const activeMsgs = active ? state.messages : [];
              const lastActive = activeMsgs[activeMsgs.length - 1];
              const dupActive = lastActive?.role === 'assistant' && String(lastActive.content ?? '') === assistantText;
              return {
                conversations: nextConvs,
                messages: active && !dupActive ? [...state.messages, msg] : state.messages,
              };
            });
            if (!engineOwnsPersist) {
              try {
                const conv = get().conversations.find((c) => c.id === sessionId);
                if (conv) await window.electronAPI?.engineUpsertConversation?.(conversationForEngineUpsert(conv));
              } catch {
                /* best-effort */
              }
            }
          }

          await get().fetchConversations({ immediate: true });

          void Promise.resolve(
            window.electronAPI?.workspaceAppendChangeLog?.({
              conversationId: sessionId,
              userPreview: mergedContent,
              assistantExcerpt: fullText,
            })
          );

          if (scheduleReceiptTriggerId) {
            void window.electronAPI?.scheduleTriggersSetAiReceipt?.({
              triggerId: scheduleReceiptTriggerId,
              receiptText: String(fullText ?? ''),
            }).then((res) => {
              if (res && typeof res === 'object' && 'ok' in res && res.ok) {
                void useScheduleTriggerStore.getState().load();
              }
            });
          }

          try {
            window.dispatchEvent(new CustomEvent('cf-workspace-files-updated'));
          } catch {
            /* ignore */
          }

          await flushPendingAfterTurn();
        };

        if (abortSignal.aborted) return;

        const useBuiltinStream = shouldUseGatewayChatTransport();

        set({
          isClassifyingMode: true,
          activeModeClassification: null,
          isExpectationPlanning: false,
          expectationPlanStream: null,
          activeExpectationPlanDisplay: null,
        });
        let classification: ConversationModeClassification;
        try {
          classification = await classifyConversationForSend(mergedContent, effectiveModelIdParam);
        } finally {
          set({ isClassifyingMode: false });
        }
        if (abortSignal.aborted) return;

        set({ activeModeClassification: classification });

        let textForMain = mergedContent;
        if (needsExpectationPlanning(classification.category)) {
          set({ isExpectationPlanning: true, expectationPlanStream: '' });
          try {
            const planned = await planExpectationForSend(
              mergedContent,
              classification,
              effectiveModelIdParam,
              (accumulated) => set({ expectationPlanStream: accumulated })
            );
            if (abortSignal.aborted) return;
            if (planned?.displayMarkdown) {
              set({
                activeExpectationPlanDisplay: planned.displayMarkdown,
                expectationPlanStream: null,
              });
            }
            if (planned?.contextForMain) {
              textForMain = `${planned.contextForMain}${mergedContent}`;
            }
          } finally {
            set({ isExpectationPlanning: false });
          }
        }
        if (abortSignal.aborted) return;

        const actualMode = classification.mode;
        const effectiveModelId = resolveModelIdForInteractionMode(actualMode, effectiveModelIdParam);
        const autoPick = {
          pickedMode: classification.mode,
          reason: classification.summary,
          category: classification.category,
          categoryLabel: classification.categoryLabel,
        };

        if (useBuiltinStream) {
          let sendWorkspaceRoot = '';
          try {
            const wa = await window.electronAPI?.workspaceGetActive?.();
            sendWorkspaceRoot = normWorkspacePath(typeof wa?.path === 'string' ? wa.path : '');
          } catch {
            sendWorkspaceRoot = '';
          }
          const overridesJson = String(useSettingsStore.getState().chatModePolicyOverridesJson ?? '').trim();
          let policyOverrides: any = null;
          try {
            policyOverrides = overridesJson ? JSON.parse(overridesJson) : null;
          } catch {
            policyOverrides = null;
          }
          const requestId = uuidv4();
          await ensureGatewayWs();
          if (abortSignal.aborted) return;

          const demuxer = new ReasoningStreamDemux();
          let deltaBuf = '';
          let rafId = 0;
          const flushDeltaBuf = () => {
            rafId = 0;
            if (!deltaBuf) return;
            const chunk = deltaBuf;
            deltaBuf = '';
            demuxer.push(chunk);
            set({
              ...streamingFromDemuxer(demuxer),
              streamingThinking: demuxer.getThinkingDisplay() || null,
            });
            if (/\[tool:(start|done|fail)\]/.test(chunk)) {
              scheduleSyncConversationsAfterTool(get);
            }
          };
          registerGatewayPendingRequest(sessionId, requestId, {
            conversationId: sessionId,
            onDelta: (text) => {
              deltaBuf += String(text ?? '');
              if (!rafId) rafId = requestAnimationFrame(flushDeltaBuf);
            },
            onFinal: (full) => {
              if (rafId) {
                cancelAnimationFrame(rafId);
                rafId = 0;
              }
              if (deltaBuf) {
                demuxer.push(deltaBuf);
                deltaBuf = '';
                set({
                  ...streamingFromDemuxer(demuxer),
                  streamingThinking: demuxer.getThinkingDisplay() || null,
                });
              }
              const t1 = performance.now();
              const reasoningPersist = demuxer.finalizeReasoning().trim() || null;
              void finalizeReply(
                full || `这是对"${mergedContent}"的回复（模拟）`,
                { ipcMs: Math.round(t1 - t0), label: 'ws' },
                reasoningPersist
              );
            },
          });

          logChatSendRenderer({
            conversationId: sessionId,
            bubbleContent: mergedContent,
            textForMain,
            mode: actualMode,
            modelId: effectiveModelId,
            workspaceRoot: sendWorkspaceRoot,
            classification: {
              category: classification.category,
              categoryLabel: classification.categoryLabel,
              mode: classification.mode,
              summary: classification.summary,
            },
            expectationPlanningRan: needsExpectationPlanning(classification.category),
          });

          const msg: GatewayWsSend = {
            type: 'chat:send',
            requestId,
            conversationId: sessionId,
            text: textForMain,
            mode: actualMode,
            autoPick,
            ...(policyOverrides ? { policyOverrides } : {}),
            modelId: effectiveModelId,
            ...(sendWorkspaceRoot ? { workspaceRoot: sendWorkspaceRoot } : {}),
          };
          await sendGatewayChatMessage(msg);
          return;
        }

        if (abortSignal.aborted) return;

        logChatSendRenderer({
          conversationId: sessionId,
          bubbleContent: mergedContent,
          textForMain,
          mode: actualMode,
          modelId: effectiveModelId,
          expectationPlanningRan: needsExpectationPlanning(classification.category),
          classification: {
            category: classification.category,
            categoryLabel: classification.categoryLabel,
            mode: classification.mode,
            summary: classification.summary,
          },
        });

        const response = await window.electronAPI?.engineSendMessage?.({
          conversationId: sessionId,
          userText: textForMain,
          mode: actualMode,
          modelId: effectiveModelId,
        });
        if (abortSignal.aborted) return;
        const t1 = performance.now();

        const replyText =
          (typeof response?.message === 'string' && response.message) ||
          (typeof response === 'string' && response) ||
          `这是对"${mergedContent}"的回复（模拟）`;

        cancelAssistantReveal();
        set({ streamingActivity: '', streamingToolHints: [], streamingThinking: null });
        let raf = 0;
        let stopped = false;
        const cleanup = () => {
          stopped = true;
          if (raf) cancelAnimationFrame(raf);
          raf = 0;
        };
        setRevealCleanup(cleanup);

        const revealStart = performance.now();
        const revealDurationMs = Math.min(900, Math.max(280, Math.floor(replyText.length * 0.45)));

        const tick = () => {
          if (stopped || abortSignal.aborted) return;
          const u = Math.min(1, (performance.now() - revealStart) / revealDurationMs);
          const smooth = u * u * (3 - 2 * u);
          const n = Math.min(replyText.length, Math.max(0, Math.round(replyText.length * smooth)));
          set({ streamingActivity: replyText.slice(0, n), streamingToolHints: [], streamingThinking: null });
          if (u >= 1) {
            setRevealCleanup(null);
            void finalizeReply(replyText, { ipcMs: Math.round(t1 - t0), label: 'reveal' });
            return;
          }
          raf = requestAnimationFrame(tick);
        };

        raf = requestAnimationFrame(tick);
      } catch (error: any) {
        if (finishOutboundTurn(sessionId, generation)) {
          cancelAssistantReveal();
          set({
            isLoading: false,
            ...clearStreamingState(),
            error: error?.message || '发送消息失败',
          });
          const pending = takePendingSends(sessionId);
          syncPendingSendQueueToStore(set, sessionId);
          if (pending.length) {
            const nextTurn = startOutboundTurnFromPending(sessionId, pending);
            void executeOutboundTurn(nextTurn);
          }
        }
      }
  };
  return executeOutboundTurn;
}
