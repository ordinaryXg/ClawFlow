import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(import.meta.dirname, '..');
const srcPath = path.join(repoRoot, 'src/store/modules/chatStore.ts');
const outDir = path.join(repoRoot, 'src/store/modules/chat-store');
const lines = fs.readFileSync(srcPath, 'utf8').split(/\r?\n/);

function slice(start, end) {
  return lines.slice(start - 1, end).join('\n');
}

fs.mkdirSync(outDir, { recursive: true });

const normalize = `import { v4 as uuidv4 } from 'uuid';
import { mergeCompletionReasoning } from '../../../utils/split-reasoning-from-content';
import { dedupeUiToolMessages } from '../../../engine/dedupe-tool-messages';
import type { Conversation, Message } from './chat-store-types';
import { coerceMessageChannel } from './chat-store-types';

${slice(129, 187).replace('function normalizeConversation', 'export function normalizeConversation')}

/** 尚未被 engine 列表确认的本地新建会话 id → 规范化工作区路径，避免 fetch 竞态覆盖，且避免跨工作区串会话 */
export const optimisticConversationWorkspace = new Map<string, string>();

${slice(254, 270).replace('function conversationForEngineUpsert', 'export function conversationForEngineUpsert')}

${slice(272, 299).replace('function mergeServerMessagesWithLocal', 'export function mergeServerMessagesWithLocal')}
`;

const internals = `import type { ConversationModeClassification } from '../../../engine/conversation-mode-classifier';
import { heuristicConversationModeClassification } from '../../../engine/conversation-mode-classifier';
import { needsExpectationPlanning } from '../../../shared/expectation-plan';
import { ReasoningStreamDemux } from '../../../utils/reasoning-stream-demux';
import {
  pickRunningToolHints,
  sanitizeStreamActivityForDisplay,
} from '../../../utils/stream-activity-sanitize';
import { getPendingSends } from '../chat-outbound-orchestrator';
import type { ChatState } from './chat-store-types';

${slice(306, 371).replace(/^async function classifyConversationForSend/, 'export async function classifyConversationForSend').replace(/^async function planExpectationForSend/, 'export async function planExpectationForSend').replace(/^function streamingFromDemuxer/, 'export function streamingFromDemuxer').replace(/^function clearStreamingState/, 'export function clearStreamingState')}

let revealCleanup: (() => void) | null = null;

export function cancelAssistantReveal() {
  revealCleanup?.();
  revealCleanup = null;
}

export function setRevealCleanup(cleanup: (() => void) | null) {
  revealCleanup = cleanup;
}

${slice(373, 401).replace(/^function scheduleFetchConversations/, 'export function scheduleFetchConversations').replace(/^function scheduleSyncConversationsAfterTool/, 'export function scheduleSyncConversationsAfterTool')}

export function syncPendingSendQueueToStore(
  set: (partial: Partial<ChatState> | ((s: ChatState) => Partial<ChatState>)) => void,
  conversationId: string | null
) {
  const items = conversationId ? getPendingSends(conversationId) : [];
  set({
    pendingSendQueue: items.map(({ id, content, enqueuedAt }) => ({ id, content, enqueuedAt })),
  });
}
`;

let outboundBody = slice(622, 951);
outboundBody = outboundBody.replace(/revealCleanup = cleanup;/g, 'setRevealCleanup(cleanup);');
outboundBody = outboundBody.replace(/revealCleanup = null;/g, 'setRevealCleanup(null);');

const outbound = `import { v4 as uuidv4 } from 'uuid';
import { resolveModelIdForInteractionMode } from '../../../engine/mode-defaults';
import type { ConversationModeClassification } from '../../../engine/conversation-mode-classifier';
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
${outboundBody}
  };
  return executeOutboundTurn;
}
`;

const fetch = `import { normalizeWorkspacePathForCompare as normWorkspacePath } from '../../../shared/workspace-path-compare';
import type { ChatState, Conversation } from './chat-store-types';
import {
  mergeServerMessagesWithLocal,
  normalizeConversation,
  optimisticConversationWorkspace,
} from './chat-store-normalize';
import { cancelAssistantReveal, clearStreamingState, scheduleFetchConversations } from './chat-store-internals';

let fetchConversationsInflight: Promise<void> | null = null;

export async function runFetchConversations(
  set: (partial: Partial<ChatState> | ((s: ChatState) => Partial<ChatState>)) => void,
  get: () => ChatState,
  opts?: { immediate?: boolean }
): Promise<void> {
  if (!opts?.immediate) {
    scheduleFetchConversations(get, { immediate: false });
    return;
  }
  if (fetchConversationsInflight) return fetchConversationsInflight;

  fetchConversationsInflight = (async () => {
${slice(529, 607)}
  })();

  try {
    await fetchConversationsInflight;
  } finally {
    fetchConversationsInflight = null;
  }
}
`;

const store = `// store/modules/chatStore.ts — 对话状态管理（Zustand 入口）
import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import {
  finishOutboundTurn,
  removePendingSend as removePendingSendFromOrchestrator,
  routeOutboundSend,
  startOutboundTurnFromPending,
  takePendingSends,
  clearOutboundStateForConversation,
} from './chat-outbound-orchestrator';
import { getCachedOutboundMergeWindowMs } from '../../shared/outbound-merge-window-client';
import { normalizeWorkspacePathForCompare as normWorkspacePath } from '../../shared/workspace-path-compare';
import {
  cancelOutboundWsForConversation,
  sendGatewayChatMessage,
  wireChatGatewayHandlers,
} from './chat-gateway-client';

export type {
  ConversationModeClassification,
  PendingSendDisplayItem,
  ToolApprovalPendingState,
  MessageChannel,
  Message,
  Conversation,
  ChatState,
} from './chat-store/chat-store-types';
export {
  resolveMessagePresentationChannel,
  shouldShowMessageChannelStrip,
} from './chat-store/chat-store-types';

import type { ChatState, Message, MessageChannel } from './chat-store/chat-store-types';
import { conversationForEngineUpsert, optimisticConversationWorkspace } from './chat-store/chat-store-normalize';
import {
  cancelAssistantReveal,
  clearStreamingState,
  syncPendingSendQueueToStore,
} from './chat-store/chat-store-internals';
import { createOutboundTurnExecutor } from './chat-store/chat-store-outbound-turn';
import { runFetchConversations } from './chat-store/chat-store-fetch';

export const useChatStore = create<ChatState>()((set, get) => {
  wireChatGatewayHandlers({
${slice(422, 453)}
  });

  const executeOutboundTurn = createOutboundTurnExecutor(set, get);

  return {
${slice(456, 519)}

    fetchConversations: (opts) => runFetchConversations(set, get, opts),

${slice(616, 620)}
${slice(954, 1175)}
  };
});

export default useChatStore;
`;

fs.writeFileSync(path.join(outDir, 'chat-store-normalize.ts'), normalize, 'utf8');
fs.writeFileSync(path.join(outDir, 'chat-store-internals.ts'), internals, 'utf8');
fs.writeFileSync(path.join(outDir, 'chat-store-outbound-turn.ts'), outbound, 'utf8');
fs.writeFileSync(path.join(outDir, 'chat-store-fetch.ts'), fetch, 'utf8');
fs.writeFileSync(path.join(repoRoot, 'src/store/modules/chatStore.ts'), store, 'utf8');
console.log('chat-store split complete');
