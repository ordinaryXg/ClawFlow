// store/modules/chatStore.ts
// 对话状态管理

import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import { resolveModelIdForInteractionMode } from '../../engine/mode-defaults';
import {
  heuristicConversationModeClassification,
  type ConversationModeClassification,
} from '../../engine/conversation-mode-classifier';
import { needsExpectationPlanning } from '../../shared/expectation-plan';
import { logChatSendRenderer } from '../../shared/chat-send-debug';
import {
  finishOutboundTurn,
  getMergedOutboundText,
  getPendingSends,
  removePendingSend as removePendingSendFromOrchestrator,
  routeOutboundSend,
  startOutboundTurnFromPending,
  takePendingSends,
  clearOutboundStateForConversation,
  type OutboundTurn,
} from './chat-outbound-orchestrator';
import { getCachedOutboundMergeWindowMs } from '../../shared/outbound-merge-window-client';

export type { ConversationModeClassification };

export type PendingSendDisplayItem = {
  id: string;
  content: string;
  enqueuedAt: number;
};
import { ReasoningStreamDemux } from '../../utils/reasoning-stream-demux';
import { mergeCompletionReasoning } from '../../utils/split-reasoning-from-content';
import { useSettingsStore } from './settingsStore';
import { useTodoTriggerStore } from './todoTriggerStore';
import { dedupeUiToolMessages } from '../../engine/dedupe-tool-messages';
import { normalizeWorkspacePathForCompare as normWorkspacePath } from '../../shared/workspace-path-compare';

type GatewayWsEvent =
  | { type: 'chat:ack'; requestId: string; conversationId: string }
  | { type: 'chat:delta'; requestId: string; conversationId: string; text: string }
  | { type: 'chat:final'; requestId: string; conversationId: string; message: string }
  | {
      type: 'chat:toolApproval';
      requestId: string;
      conversationId: string;
      approvalId: string;
      tools: Array<{ name: string; argumentsPreview: string }>;
      riskLevel?: 'medium' | 'high';
      timeoutMs?: number;
      defaultApproved?: boolean;
    }
  | { type: 'gateway:log'; entry: { ts: number; level: string; msg: string } }
  | { type: 'gateway:status'; status: string; port: number; uptimeMs: number };

type GatewayWsSend =
  | {
      type: 'chat:send';
      requestId: string;
      conversationId: string;
      text: string;
      mode: 'ask' | 'plan' | 'multitask';
      autoPick?: {
        pickedMode: 'ask' | 'plan' | 'multitask';
        reason: string;
        category?: string;
        categoryLabel?: string;
      };
      policyOverrides?: unknown;
      modelId?: string;
      workspaceRoot?: string;
    }
  | { type: 'gateway:ping' }
  | { type: 'chat:toolApprovalResponse'; requestId: string; approvalId: string; approved: boolean };

export type ToolApprovalPendingState = {
  requestId: string;
  conversationId: string;
  approvalId: string;
  tools: Array<{ name: string; argumentsPreview: string }>;
  riskLevel: 'medium' | 'high';
  timeoutMs: number;
  defaultApproved: boolean;
  startedAt: number;
};

/** 对话气泡来源渠道：用于区分样式；未填写时按 role 推导默认外观 */
export type MessageChannel =
  | 'user_manual'
  | 'user_feishu'
  | 'user_todo_auto'
  | 'user_tool_delegate'
  | 'user_workflow'
  | 'user_system'
  | 'assistant_llm'
  | 'assistant_tool_summary';

const MESSAGE_CHANNELS: readonly MessageChannel[] = [
  'user_manual',
  'user_feishu',
  'user_todo_auto',
  'user_tool_delegate',
  'user_workflow',
  'user_system',
  'assistant_llm',
  'assistant_tool_summary',
];

function coerceMessageChannel(_role: Message['role'], raw: unknown): MessageChannel | undefined {
  if (typeof raw !== 'string') return undefined;
  if ((MESSAGE_CHANNELS as readonly string[]).includes(raw)) return raw as MessageChannel;
  return undefined;
}

/** UI：缺省渠道与手写消息、模型回复对齐 */
export function resolveMessagePresentationChannel(message: Message): MessageChannel {
  return message.channel ?? (message.role === 'user' ? 'user_manual' : 'assistant_llm');
}

export function shouldShowMessageChannelStrip(message: Message): boolean {
  const ch = resolveMessagePresentationChannel(message);
  return ch !== 'user_manual' && ch !== 'assistant_llm';
}

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'tool';
  content: string;
  timestamp: number;
  /** 模型思考过程（DeepSeek reasoning 等），与正文分开展示 */
  reasoningContent?: string;
  /** 消息渠道（样式与角标）；缺省时 UI 视作 user_manual / assistant_llm */
  channel?: MessageChannel;
  /** tool 消息：与 tool_calls 对齐的 id（用于聚合/追溯） */
  toolCallId?: string;
  /** 原样透传 stored meta（用于工具卡片渲染） */
  meta?: Record<string, unknown>;
}

export interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
}

function normalizeConversation(raw: unknown): Conversation | null {
  if (!raw || typeof raw !== 'object') return null;
  const c = raw as Record<string, unknown>;
  if (typeof c.id !== 'string') return null;
  const msgs = Array.isArray(c.messages) ? c.messages : [];
  const messages: Message[] = msgs
    .filter((m) => {
      const r = m as Record<string, unknown>;
      return r?.role === 'user' || r?.role === 'assistant' || r?.role === 'tool';
    })
    .map((m: any) => {
      const id = typeof m?.id === 'string' ? m.id : uuidv4();
      const ts = typeof m?.timestamp === 'number' ? m.timestamp : Date.now();
      if (m?.role === 'user') {
        const ch = coerceMessageChannel('user', (m as Record<string, unknown>).channel);
        return {
          id,
          role: 'user' as const,
          content: String(m?.content ?? ''),
          timestamp: ts,
          ...(ch ? { channel: ch } : {}),
        };
      }
      if (m?.role === 'tool') {
        const toolCallId = typeof m?.tool_call_id === 'string' ? m.tool_call_id : '';
        const meta = m?.meta && typeof m.meta === 'object' ? (m.meta as Record<string, unknown>) : undefined;
        // tool 消息默认不展示渠道 strip（channel 缺省），通过 ToolMessageItem 自己做样式
        return {
          id,
          role: 'tool' as const,
          content: String(m?.content ?? ''),
          timestamp: ts,
          ...(toolCallId ? { toolCallId } : {}),
          ...(meta ? { meta } : {}),
        };
      }
      const merged = mergeCompletionReasoning(m?.content, m?.reasoning_content);
      const rc = merged.reasoningCombined.trim() || undefined;
      const ach = coerceMessageChannel('assistant', (m as Record<string, unknown>).channel);
      const meta = m?.meta && typeof m.meta === 'object' ? (m.meta as Record<string, unknown>) : undefined;
      return {
        id,
        role: 'assistant' as const,
        content: merged.displayContent,
        timestamp: ts,
        ...(rc ? { reasoningContent: rc } : {}),
        ...(ach ? { channel: ach } : {}),
        ...(meta ? { meta } : {}),
      };
    });
  const now = Date.now();
  return {
    id: c.id,
    title: typeof c.title === 'string' ? c.title : '对话',
    messages: dedupeUiToolMessages(messages),
    createdAt: typeof c.createdAt === 'number' ? c.createdAt : now,
    updatedAt: typeof c.updatedAt === 'number' ? c.updatedAt : now,
  };
}

export interface ChatState {
  conversations: Conversation[];
  activeConversationId: string | null;
  messages: Message[];
  isLoading: boolean;
  /** 流式：工具进度等非思考文本 */
  streamingActivity: string | null;
  /** 流式：思考过程（已由 demux 剥离标记） */
  streamingThinking: string | null;
  error: string | null;
  /** 最近一次发送前的模式分类（测试展示，不落消息列表） */
  activeModeClassification: ConversationModeClassification | null;
  isClassifyingMode: boolean;
  /** M3/M4 预期规划进行中 */
  isExpectationPlanning: boolean;
  /** 规划流式原始输出（编排中） */
  expectationPlanStream: string | null;
  /** 规划完成后的展示文本（Markdown 风格纯文本） */
  activeExpectationPlanDisplay: string | null;
  /** 模型回复中挂起、待自动发送的用户消息（当前会话） */
  pendingSendQueue: PendingSendDisplayItem[];
  /** Gateway 工具执行前待用户确认（仅当前连接会话） */
  toolApprovalPending: ToolApprovalPendingState | null;

  // Actions
  fetchConversations: () => Promise<void>;
  sendMessage: (
    content: string,
    modelId?: string | null,
    opts?: { userChannel?: MessageChannel; todoFireReceipt?: { triggerId: string } }
  ) => Promise<void>;
  createConversation: () => Promise<void>;
  switchConversation: (id: string) => void;
  deleteConversation: (id: string) => void;
  clearMessages: () => void;
  setError: (error: string | null) => void;
  removePendingSend: (id: string) => void;
  respondToolApproval: (approved: boolean) => void;
  /** 待办触发器：向当前会话写入用户消息，可选走与手动发送相同的模型请求 */
  applyTodoTrigger: (payload: {
    workspaceRoot: string;
    text: string;
    submitToModel: boolean;
    triggerId?: string;
  }) => Promise<void>;
}

let revealCleanup: (() => void) | null = null;

/** 尚未被 engine 列表确认的本地新建会话 id → 规范化工作区路径，避免 fetch 竞态覆盖，且避免跨工作区串会话 */
const optimisticConversationWorkspace = new Map<string, string>();

/** 渲染进程 Conversation → 主进程持久化消息字段（reasoning_content 等） */
function conversationForEngineUpsert(conv: Conversation) {
  return {
    ...conv,
    messages: conv.messages.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      timestamp: m.timestamp,
      ...(m.channel ? { channel: m.channel } : {}),
      ...(m.role === 'assistant' && m.reasoningContent?.trim()
        ? { reasoning_content: m.reasoningContent.trim() }
        : {}),
    })),
  };
}

function cancelAssistantReveal() {
  revealCleanup?.();
  revealCleanup = null;
}

async function classifyConversationForSend(
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

async function planExpectationForSend(
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

type Pending = {
  conversationId: string;
  demuxer: ReasoningStreamDemux;
  onDelta: (text: string) => void;
  onFinal: (full: string) => void | Promise<void>;
};

let lastToolConvSyncTs = 0;
const TOOL_CONV_SYNC_MIN_MS = 300;

function scheduleSyncConversationsAfterTool(getState: () => { fetchConversations: () => Promise<void> }): void {
  const now = Date.now();
  if (now - lastToolConvSyncTs < TOOL_CONV_SYNC_MIN_MS) return;
  lastToolConvSyncTs = now;
  void getState().fetchConversations().catch(() => undefined);
}

let wsClient: WebSocket | null = null;
let wsConnecting: Promise<WebSocket> | null = null;
const pendingById = new Map<string, Pending>();
const activeRequestByConversation = new Map<string, string>();

function syncPendingSendQueueToStore(
  set: (partial: Partial<ChatState> | ((s: ChatState) => Partial<ChatState>)) => void,
  conversationId: string | null
) {
  const items = conversationId ? getPendingSends(conversationId) : [];
  set({
    pendingSendQueue: items.map(({ id, content, enqueuedAt }) => ({ id, content, enqueuedAt })),
  });
}

function cancelOutboundWsForConversation(sessionId: string) {
  const prevId = activeRequestByConversation.get(sessionId);
  if (!prevId) return;
  try {
    if (wsClient?.readyState === WebSocket.OPEN) {
      wsClient.send(JSON.stringify({ type: 'chat:cancel', requestId: prevId }));
    }
  } catch {
    /* ignore */
  }
  pendingById.delete(prevId);
  clearToolApprovalForRequest(prevId);
  activeRequestByConversation.delete(sessionId);
}

let applyGatewayToolApproval: (payload: Extract<GatewayWsEvent, { type: 'chat:toolApproval' }>) => void =
  () => undefined;
let clearToolApprovalForRequest: (requestId: string) => void = () => undefined;

async function ensureGatewayWs(): Promise<WebSocket> {
  if (wsClient && wsClient.readyState === WebSocket.OPEN) return wsClient;
  if (wsConnecting) return wsConnecting;

  wsConnecting = (async () => {
    const api = window.electronAPI;
    if (!api?.engineGatewayStart || !api?.engineGatewayStatus) {
      throw new Error('Gateway 仅在 Electron 应用内可用（缺少 engineGateway IPC）。');
    }

    // 必须先让 GatewayDaemon 在本机 listen，再连 WS；不可用默认 18789 猜测（未启动时必失败）。
    try {
      await api.engineGatewayStart();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(`启动 Gateway 失败: ${msg}`);
    }

    let port: number | undefined;
    for (let i = 0; i < 25; i++) {
      const st = await api.engineGatewayStatus();
      if (st?.status === 'running' && typeof st.port === 'number' && st.port > 0) {
        port = st.port;
        break;
      }
      await new Promise((r) => setTimeout(r, 60));
    }
    if (port == null) {
      const st = await api.engineGatewayStatus();
      throw new Error(
        `Gateway 未在本地监听（状态: ${String(st?.status ?? 'unknown')}）。请在「设置」中启动或重启 Gateway，并确认 127.0.0.1 端口未被占用。`
      );
    }

    const url = `ws://127.0.0.1:${port}/ws`;

    const ws = await new Promise<WebSocket>((resolve, reject) => {
      const sock = new WebSocket(url);
      const onOpen = () => {
        cleanup();
        resolve(sock);
      };
      const onError = (ev: Event) => {
        cleanup();
        // 浏览器 WS 的 error 事件拿不到太多细节，但至少带上 url/port 便于诊断
        reject(new Error(`Gateway WebSocket connect failed (${url})`));
      };
      const cleanup = () => {
        sock.removeEventListener('open', onOpen);
        sock.removeEventListener('error', onError);
      };
      sock.addEventListener('open', onOpen);
      sock.addEventListener('error', onError);
    });

    ws.addEventListener('message', (ev) => {
      let payload: GatewayWsEvent | null = null;
      try {
        payload = JSON.parse(String((ev as MessageEvent).data ?? '')) as GatewayWsEvent;
      } catch {
        return;
      }
      if (!payload || typeof payload !== 'object') return;

      if (payload.type === 'gateway:log') {
        return;
      }

      if (payload.type === 'chat:toolApproval') {
        applyGatewayToolApproval(payload);
        return;
      }

      if (payload.type === 'chat:delta') {
        const p = pendingById.get(payload.requestId);
        if (!p || p.conversationId !== payload.conversationId) return;
        p.onDelta(String(payload.text ?? ''));
        return;
      }

      if (payload.type === 'chat:final') {
        clearToolApprovalForRequest(payload.requestId);
        const p = pendingById.get(payload.requestId);
        if (!p || p.conversationId !== payload.conversationId) return;
        pendingById.delete(payload.requestId);
        p.onFinal(String(payload.message ?? ''));
        return;
      }
    });

    ws.addEventListener('close', () => {
      wsClient = null;
      wsConnecting = null;
    });

    wsClient = ws;
    wsConnecting = null;
    return ws;
  })();

  try {
    return await wsConnecting;
  } catch (e) {
    // 关键：第一次连接失败后必须清理 wsConnecting，否则后续永远复用“失败的 Promise”，导致一直报错。
    wsClient = null;
    wsConnecting = null;
    throw e;
  }
}

export const useChatStore = create<ChatState>()((set, get) => {
  applyGatewayToolApproval = (payload) => {
    const tools = Array.isArray(payload.tools)
      ? payload.tools
          .filter((t) => t && typeof t === 'object')
          .map((t) => ({
            name: String((t as { name?: string }).name ?? 'unknown'),
            argumentsPreview: String((t as { argumentsPreview?: string }).argumentsPreview ?? ''),
          }))
      : [];
    const approvalId = String(payload.approvalId ?? '').trim();
    if (!approvalId) return;
    const riskLevel = payload.riskLevel === 'high' ? 'high' : 'medium';
    const timeoutMsRaw = typeof payload.timeoutMs === 'number' && Number.isFinite(payload.timeoutMs) ? payload.timeoutMs : 20_000;
    const timeoutMs = Math.max(1000, Math.min(120_000, Math.floor(timeoutMsRaw)));
    const defaultApproved = typeof payload.defaultApproved === 'boolean' ? payload.defaultApproved : riskLevel === 'medium';
    const startedAt = Date.now();
    set({
      toolApprovalPending: {
        requestId: String(payload.requestId ?? ''),
        conversationId: String(payload.conversationId ?? ''),
        approvalId,
        tools,
        riskLevel,
        timeoutMs,
        defaultApproved,
        startedAt,
      },
    });
  };
  clearToolApprovalForRequest = (requestId) =>
    set((s) => (s.toolApprovalPending?.requestId === requestId ? { toolApprovalPending: null } : {}));

  return {
  conversations: [],
  activeConversationId: null,
  messages: [],
  isLoading: false,
  streamingActivity: null,
  streamingThinking: null,
  error: null,
  activeModeClassification: null,
  isClassifyingMode: false,
  isExpectationPlanning: false,
  expectationPlanStream: null,
  activeExpectationPlanDisplay: null,
  pendingSendQueue: [],
  toolApprovalPending: null,

  removePendingSend: (id) => {
    const sessionId = get().activeConversationId;
    if (!sessionId) return;
    removePendingSendFromOrchestrator(sessionId, id);
    syncPendingSendQueueToStore(set, sessionId);
  },

  respondToolApproval: (approved: boolean) => {
    const pending = get().toolApprovalPending;
    if (!pending) return;
    set({ toolApprovalPending: null });
    void (async () => {
      try {
        const ws = await ensureGatewayWs();
        const msg: GatewayWsSend = {
          type: 'chat:toolApprovalResponse',
          requestId: pending.requestId,
          approvalId: pending.approvalId,
          approved,
        };
        ws.send(JSON.stringify(msg));
      } catch {
        /* ignore */
      }
    })();
  },

  fetchConversations: async () => {
    cancelAssistantReveal();
    try {
      const res = await window.electronAPI?.engineGetConversations?.();
      const rawList = Array.isArray(res) ? res : Array.isArray(res?.conversations) ? res.conversations : null;
      // 响应异常时勿清空本地列表（否则像「历史被抹掉」）；仅明确拉取到空数组时才覆盖为空。
      if (rawList == null) {
        // eslint-disable-next-line no-console
        console.warn('[chat] fetchConversations: 未收到有效 conversations 数组，保留当前界面状态', res);
        set({ error: '对话列表响应异常，未更新界面。请重试或检查主进程日志。' });
        return;
      }

      const fromRes = rawList.map(normalizeConversation).filter(Boolean) as Conversation[];
      const current = get().conversations;

      let activeWs = '';
      try {
        const a = await window.electronAPI?.workspaceGetActive?.();
        activeWs = normWorkspacePath(typeof a?.path === 'string' ? a.path : '');
      } catch {
        activeWs = '';
      }

      // 合并：服务端列表 + 同一工作区下尚未出现在本次拉取中的乐观新建会话
      const mergedMap = new Map<string, Conversation>();
      for (const c of fromRes) mergedMap.set(c.id, c);
      for (const c of current) {
        if (mergedMap.has(c.id)) continue;
        if (optimisticConversationWorkspace.get(c.id) === activeWs) {
          mergedMap.set(c.id, c);
        }
      }
      const merged = Array.from(mergedMap.values()).sort((a, b) => b.updatedAt - a.updatedAt);

      for (const c of fromRes) {
        optimisticConversationWorkspace.delete(c.id);
      }

      const prev = get().activeConversationId;
      const stillValid = Boolean(prev && merged.some((c) => c.id === prev));
      const activeId = stillValid ? prev : (merged[0]?.id ?? null);
      const active = activeId ? merged.find((c) => c.id === activeId) : null;
      set({
        conversations: merged,
        activeConversationId: activeId,
        messages: active?.messages ?? [],
        error: null,
      });
    } catch (e: any) {
      set({ error: e?.message || '获取对话历史失败' });
    }
  },

  sendMessage: async (
    content: string,
    modelId?: string | null,
    opts?: { userChannel?: MessageChannel; todoFireReceipt?: { triggerId: string } }
  ) => {
    const executeOutboundTurn = async (turn: OutboundTurn) => {
      const sessionId = turn.conversationId;
      const generation = turn.generation;
      const mergedContent = getMergedOutboundText(turn);
      const effectiveModelIdParam = turn.modelId;
      const todoReceiptTriggerId = turn.opts?.todoFireReceipt?.triggerId?.trim() ?? null;
      const abortSignal = turn.abortController.signal;

      const flushPendingAfterTurn = async () => {
        const pending = takePendingSends(sessionId);
        syncPendingSendQueueToStore(set, sessionId);
        if (!pending.length) return;
        const nextTurn = startOutboundTurnFromPending(sessionId, pending);
        await executeOutboundTurn(nextTurn);
      };

      cancelAssistantReveal();
      set({ streamingActivity: '', streamingThinking: null, isLoading: true });

      try {
        const t0 = performance.now();

        const finalizeReply = async (
          fullText: string,
          log?: { ipcMs: number; label: string },
          reasoningText?: string | null
        ) => {
          if (!finishOutboundTurn(sessionId, generation)) return;

          set({
            isLoading: false,
            streamingActivity: null,
            streamingThinking: null,
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
              return {
                conversations: nextConvs,
                messages: active ? [...state.messages, msg] : state.messages,
              };
            });
            try {
              const conv = get().conversations.find((c) => c.id === sessionId);
              if (conv) await window.electronAPI?.engineUpsertConversation?.(conversationForEngineUpsert(conv));
            } catch {
              /* best-effort */
            }
          }

          await get().fetchConversations();

          void Promise.resolve(
            window.electronAPI?.workspaceAppendChangeLog?.({
              conversationId: sessionId,
              userPreview: mergedContent,
              assistantExcerpt: fullText,
            })
          );

          if (todoReceiptTriggerId) {
            void window.electronAPI?.todoTriggersSetAiReceipt?.({
              triggerId: todoReceiptTriggerId,
              receiptText: String(fullText ?? ''),
            }).then((res) => {
              if (res && typeof res === 'object' && 'ok' in res && res.ok) {
                void useTodoTriggerStore.getState().load();
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

        const useBuiltinStream =
          typeof WebSocket !== 'undefined' &&
          typeof window.electronAPI?.engineGatewayStatus === 'function' &&
          typeof window.electronAPI?.engineGatewayStart === 'function';

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
          const ws = await ensureGatewayWs();
          if (abortSignal.aborted) return;

          cancelOutboundWsForConversation(sessionId);
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
              streamingActivity: demuxer.getActivity(),
              streamingThinking: demuxer.getThinkingDisplay() || null,
            });
            if (/\[tool:(start|done|fail)\]/.test(chunk)) {
              window.dispatchEvent(new CustomEvent('cf-workspace-files-updated'));
              scheduleSyncConversationsAfterTool(get);
            }
          };
          pendingById.set(requestId, {
            conversationId: sessionId,
            demuxer,
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
                  streamingActivity: demuxer.getActivity(),
                  streamingThinking: demuxer.getThinkingDisplay() || null,
                });
              }
              if (activeRequestByConversation.get(sessionId) === requestId) {
                activeRequestByConversation.delete(sessionId);
              }
              clearToolApprovalForRequest(requestId);
              const t1 = performance.now();
              const reasoningPersist = demuxer.finalizeReasoning().trim() || null;
              void finalizeReply(
                full || `这是对"${mergedContent}"的回复（模拟）`,
                { ipcMs: Math.round(t1 - t0), label: 'ws' },
                reasoningPersist
              );
            },
          });
          activeRequestByConversation.set(sessionId, requestId);

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
          ws.send(JSON.stringify(msg));
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
        set({ streamingActivity: '', streamingThinking: null });
        let raf = 0;
        let stopped = false;
        const cleanup = () => {
          stopped = true;
          if (raf) cancelAnimationFrame(raf);
          raf = 0;
        };
        revealCleanup = cleanup;

        const revealStart = performance.now();
        const revealDurationMs = Math.min(900, Math.max(280, Math.floor(replyText.length * 0.45)));

        const tick = () => {
          if (stopped || abortSignal.aborted) return;
          const u = Math.min(1, (performance.now() - revealStart) / revealDurationMs);
          const smooth = u * u * (3 - 2 * u);
          const n = Math.min(replyText.length, Math.max(0, Math.round(replyText.length * smooth)));
          set({ streamingActivity: replyText.slice(0, n), streamingThinking: null });
          if (u >= 1) {
            revealCleanup = null;
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
            streamingActivity: null,
            streamingThinking: null,
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

    cancelAssistantReveal();
    const { activeConversationId } = get();

    let conversationId = activeConversationId;
    if (!conversationId) {
      await get().fetchConversations();
      conversationId = get().activeConversationId;
    }

    if (!conversationId) {
      set({ isLoading: false, error: '当前工作区没有可用对话，请稍后重试或切换工作区。' });
      return;
    }
    const sessionId = conversationId;

    const userMessage: Message = {
      id: uuidv4(),
      role: 'user',
      content,
      timestamp: Date.now(),
      ...(opts?.userChannel ? { channel: opts.userChannel } : { channel: 'user_manual' as const }),
    };

    set((state) => {
      const updatedConversations = state.conversations.map((conv) => {
        if (conv.id === sessionId) {
          return {
            ...conv,
            messages: [...conv.messages, userMessage],
            updatedAt: Date.now(),
          };
        }
        return conv;
      });

      return {
        conversations: updatedConversations,
        messages: [...state.messages, userMessage],
        isLoading: true,
        streamingActivity: null,
        streamingThinking: null,
        error: null,
      };
    });

    try {
      const conv = get().conversations.find((c) => c.id === sessionId);
      if (conv) await window.electronAPI?.engineUpsertConversation?.(conversationForEngineUpsert(conv));
    } catch {
      // best-effort
    }

    const route = routeOutboundSend({
      conversationId: sessionId,
      content,
      modelId,
      mergeWindowMs: getCachedOutboundMergeWindowMs(),
      opts: opts
        ? {
            ...(opts.userChannel ? { userChannel: opts.userChannel } : {}),
            ...(opts.todoFireReceipt ? { todoFireReceipt: opts.todoFireReceipt } : {}),
          }
        : undefined,
    });
    syncPendingSendQueueToStore(set, sessionId);

    if (route.action === 'queue') {
      return;
    }

    if (route.action === 'merge') {
      cancelOutboundWsForConversation(sessionId);
      cancelAssistantReveal();
      set({ streamingActivity: null, streamingThinking: null });
    }

    await executeOutboundTurn(route.turn);
  },

  createConversation: async () => {
    cancelAssistantReveal();
    await get().fetchConversations();
  },

  switchConversation: (id: string) => {
    cancelAssistantReveal();
    const { conversations } = get();
    const conversation = conversations.find((conv) => conv.id === id);

    if (conversation) {
      set({
        activeConversationId: id,
        messages: conversation.messages,
        streamingActivity: null,
        streamingThinking: null,
        error: null,
      });
      syncPendingSendQueueToStore(set, id);
    }
  },

  deleteConversation: (id: string) => {
    cancelAssistantReveal();
    optimisticConversationWorkspace.delete(id);
    set((state) => {
      const updatedConversations = state.conversations.filter((conv) => conv.id !== id);
      const newActiveId =
        state.activeConversationId === id
          ? updatedConversations.length > 0
            ? updatedConversations[0].id
            : null
          : state.activeConversationId;

      return {
        conversations: updatedConversations,
        activeConversationId: newActiveId,
        messages: newActiveId
          ? updatedConversations.find((conv) => conv.id === newActiveId)?.messages || []
          : [],
        streamingActivity: null,
        streamingThinking: null,
        error: null,
      };
    });

    void window.electronAPI?.engineDeleteConversation?.(id);
    clearOutboundStateForConversation(id);
    if (get().activeConversationId === id) syncPendingSendQueueToStore(set, get().activeConversationId);
  },

  clearMessages: () => {
    cancelAssistantReveal();
    const { activeConversationId, conversations } = get();
    if (!activeConversationId) return;

    const prev = conversations.find((c) => c.id === activeConversationId);
    if (!prev) return;

    const cleared = { ...prev, messages: [] as Message[], updatedAt: Date.now() };
    set({
      conversations: conversations.map((conv) => (conv.id === activeConversationId ? cleared : conv)),
      messages: [],
      streamingActivity: null,
      streamingThinking: null,
    });
    void window.electronAPI?.engineUpsertConversation?.(conversationForEngineUpsert(cleared));
  },

  setError: (error: string | null) => {
    set({ error });
  },

  applyTodoTrigger: async (payload: {
    workspaceRoot: string;
    text: string;
    submitToModel: boolean;
    triggerId?: string;
  }) => {
    const rawText = String(payload?.text ?? '').trim();
    if (!rawText) return;
    let activeWs = '';
    try {
      const a = await window.electronAPI?.workspaceGetActive?.();
      activeWs = normWorkspacePath(typeof a?.path === 'string' ? a.path : '');
    } catch {
      return;
    }
    if (activeWs !== normWorkspacePath(payload.workspaceRoot)) return;
    if (payload.submitToModel) {
      const tid = String(payload.triggerId ?? '').trim();
      await get().sendMessage(rawText, null, {
        userChannel: 'user_todo_auto',
        ...(tid ? { todoFireReceipt: { triggerId: tid } } : {}),
      });
      return;
    }
    cancelAssistantReveal();
    let conversationId = get().activeConversationId;
    if (!conversationId) {
      await get().fetchConversations();
      conversationId = get().activeConversationId;
    }
    if (!conversationId) return;
    const sessionId = conversationId;
    const userMessage: Message = {
      id: uuidv4(),
      role: 'user',
      content: rawText,
      timestamp: Date.now(),
      channel: 'user_todo_auto',
    };
    set((state) => {
      const updatedConversations = state.conversations.map((conv) => {
        if (conv.id === sessionId) {
          return {
            ...conv,
            messages: [...conv.messages, userMessage],
            updatedAt: Date.now(),
          };
        }
        return conv;
      });
      return {
        conversations: updatedConversations,
        messages: [...state.messages, userMessage],
        error: null,
      };
    });
    try {
      const conv = get().conversations.find((c) => c.id === sessionId);
      if (conv) await window.electronAPI?.engineUpsertConversation?.(conversationForEngineUpsert(conv));
    } catch {
      /* ignore */
    }
  },
};
});

export default useChatStore;
