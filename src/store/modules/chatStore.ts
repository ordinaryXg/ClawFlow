// store/modules/chatStore.ts
// 对话状态管理

import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import { autoPickMode, type ChatIntent } from '../../engine/mode-policy';
import { ReasoningStreamDemux } from '../../utils/reasoning-stream-demux';
import { mergeCompletionReasoning } from '../../utils/split-reasoning-from-content';
import { useSettingsStore } from './settingsStore';

export type ChatInteractionMode = 'plan' | 'multitask' | 'auto';

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
    }
  | { type: 'gateway:log'; entry: { ts: number; level: string; msg: string } }
  | { type: 'gateway:status'; status: string; port: number; uptimeMs: number };

type GatewayWsSend =
  | {
      type: 'chat:send';
      requestId: string;
      conversationId: string;
      text: string;
      mode: 'plan' | 'multitask';
      intent?: ChatIntent;
      autoPick?: { pickedMode: 'plan' | 'multitask'; reason: string };
      policyOverrides?: unknown;
      modelId?: string;
    }
  | { type: 'gateway:ping' }
  | { type: 'chat:toolApprovalResponse'; requestId: string; approvalId: string; approved: boolean };

export type ToolApprovalPendingState = {
  requestId: string;
  conversationId: string;
  approvalId: string;
  tools: Array<{ name: string; argumentsPreview: string }>;
};

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  /** 模型思考过程（DeepSeek reasoning 等），与正文分开展示 */
  reasoningContent?: string;
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
      return r?.role === 'user' || r?.role === 'assistant';
    })
    .map((m: any) => {
      const id = typeof m?.id === 'string' ? m.id : uuidv4();
      const ts = typeof m?.timestamp === 'number' ? m.timestamp : Date.now();
      if (m?.role === 'user') {
        return {
          id,
          role: 'user' as const,
          content: String(m?.content ?? ''),
          timestamp: ts,
        };
      }
      const merged = mergeCompletionReasoning(m?.content, m?.reasoning_content);
      const rc = merged.reasoningCombined.trim() || undefined;
      return {
        id,
        role: 'assistant' as const,
        content: merged.displayContent,
        timestamp: ts,
        ...(rc ? { reasoningContent: rc } : {}),
      };
    });
  const now = Date.now();
  return {
    id: c.id,
    title: typeof c.title === 'string' ? c.title : '对话',
    messages,
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
  interactionMode: ChatInteractionMode;
  /** Gateway 工具执行前待用户确认（仅当前连接会话） */
  toolApprovalPending: ToolApprovalPendingState | null;

  // Actions
  fetchConversations: () => Promise<void>;
  sendMessage: (content: string, modelId?: string | null) => Promise<void>;
  createConversation: () => Promise<void>;
  switchConversation: (id: string) => void;
  deleteConversation: (id: string) => void;
  clearMessages: () => void;
  setError: (error: string | null) => void;
  setInteractionMode: (mode: ChatInteractionMode) => void;
  respondToolApproval: (approved: boolean) => void;
}

let revealCleanup: (() => void) | null = null;

/** 尚未被 engine 列表确认的本地新建会话 id → 规范化工作区路径，避免 fetch 竞态覆盖，且避免跨工作区串会话 */
const optimisticConversationWorkspace = new Map<string, string>();

function normWorkspacePath(p: string | null | undefined): string {
  return String(p ?? '')
    .trim()
    .replace(/[/\\]+$/, '')
    .replace(/\\/g, '/')
    .toLowerCase();
}

/** 渲染进程 Conversation → 主进程持久化消息字段（reasoning_content 等） */
function conversationForEngineUpsert(conv: Conversation) {
  return {
    ...conv,
    messages: conv.messages.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      timestamp: m.timestamp,
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

/** UI 已隐藏 Ask；发往引擎/Gateway 仅使用 plan 或 multitask。 */
function resolveEnginePlanMultitask(
  mode: ChatInteractionMode,
  text: string
): {
  actual: 'plan' | 'multitask';
  autoPick: { pickedMode: 'plan' | 'multitask'; reason: string } | null;
} {
  if (mode === 'auto') {
    const auto = autoPickMode(text);
    const picked: 'plan' | 'multitask' = auto.pickedMode === 'multitask' ? 'multitask' : 'plan';
    return { actual: picked, autoPick: { reason: auto.reason, pickedMode: picked } };
  }
  if (mode === 'multitask') return { actual: 'multitask', autoPick: null };
  return { actual: 'plan', autoPick: null };
}

type Pending = {
  conversationId: string;
  demuxer: ReasoningStreamDemux;
  onDelta: (text: string) => void;
  onFinal: (full: string) => void;
};

let wsClient: WebSocket | null = null;
let wsConnecting: Promise<WebSocket> | null = null;
const pendingById = new Map<string, Pending>();
const activeRequestByConversation = new Map<string, string>();

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
        // eslint-disable-next-line no-console
        console.debug('[gateway]', payload.entry?.level, payload.entry?.msg);
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
    set({
      toolApprovalPending: {
        requestId: String(payload.requestId ?? ''),
        conversationId: String(payload.conversationId ?? ''),
        approvalId,
        tools,
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
  interactionMode: 'plan',
  toolApprovalPending: null,

  setInteractionMode: (mode) => set({ interactionMode: mode }),

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
      if (!rawList) {
        set({
          conversations: [],
          activeConversationId: null,
          messages: [],
          error: null,
        });
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

  sendMessage: async (content: string, modelId?: string | null) => {
    cancelAssistantReveal();
    const now = Date.now();
    const { activeConversationId, interactionMode } = get();

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

    try {
      const t0 = performance.now();

      const finalizeReply = (
        fullText: string,
        log?: { ipcMs: number; label: string },
        reasoningText?: string | null
      ) => {
        const rc = typeof reasoningText === 'string' && reasoningText.trim() ? reasoningText.trim() : undefined;
        const assistantMessage: Message = {
          id: uuidv4(),
          role: 'assistant',
          content: fullText,
          timestamp: Date.now(),
          ...(rc ? { reasoningContent: rc } : {}),
        };

        set((state) => {
          const updatedConversations = state.conversations.map((conv) => {
            if (conv.id === sessionId) {
              return {
                ...conv,
                messages: [...conv.messages, assistantMessage],
                updatedAt: Date.now(),
              };
            }
            return conv;
          });

          return {
            conversations: updatedConversations,
            messages: [...state.messages, assistantMessage],
            isLoading: false,
            streamingActivity: null,
            streamingThinking: null,
          };
        });

        void Promise.resolve(
          window.electronAPI?.workspaceAppendChangeLog?.({
            conversationId: sessionId,
            userPreview: content,
            assistantExcerpt: fullText,
          })
        ).then((res) => {
          if (res && typeof res === 'object' && 'ok' in res && res.ok) {
            window.dispatchEvent(new CustomEvent('cf-workspace-changelog-updated'));
          }
        });

        const ipcMs = log?.ipcMs ?? Math.round(performance.now() - t0);
        // eslint-disable-next-line no-console
        console.log(
          `[chat] sendMessage engine=builtin ${log?.label ? `${log.label} ` : ''}ipc_ms=${ipcMs} chars=${fullText.length} mode=${interactionMode}`
        );
      };

      const useBuiltinStream =
        typeof WebSocket !== 'undefined' &&
        typeof window.electronAPI?.engineGatewayStatus === 'function' &&
        typeof window.electronAPI?.engineGatewayStart === 'function';

      if (useBuiltinStream) {
        cancelAssistantReveal();
        set({ streamingActivity: '', streamingThinking: null });
        const intent = (useSettingsStore.getState().chatIntent ?? 'strong') as ChatIntent;
        const overridesJson = String(useSettingsStore.getState().chatModePolicyOverridesJson ?? '').trim();
        let policyOverrides: any = null;
        try {
          policyOverrides = overridesJson ? JSON.parse(overridesJson) : null;
        } catch {
          policyOverrides = null;
        }
        const { actual: actualMode, autoPick } = resolveEnginePlanMultitask(interactionMode, content);
        const sendMeta = {
          conversationId: sessionId,
          mode: actualMode,
          intent,
          ...(autoPick ? { autoPick: autoPick } : {}),
          modelId: modelId ?? null,
          textLen: content.length,
        };
        // eslint-disable-next-line no-console
        console.debug('[chat-debug] send(ws)', sendMeta);
        const requestId = uuidv4();
        const ws = await ensureGatewayWs();

        // Cancel previous in-flight request for this conversation (best-effort).
        const prevId = activeRequestByConversation.get(sessionId);
        if (prevId) {
          try {
            ws.send(JSON.stringify({ type: 'chat:cancel', requestId: prevId }));
          } catch {
            // ignore
          }
          pendingById.delete(prevId);
          clearToolApprovalForRequest(prevId);
        }
        activeRequestByConversation.set(sessionId, requestId);

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
          if (/\[tool:(done|fail)\]/.test(chunk)) {
            window.dispatchEvent(new CustomEvent('cf-workspace-files-updated'));
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
            finalizeReply(full || `这是对"${content}"的回复（模拟）`, { ipcMs: Math.round(t1 - t0), label: 'ws' }, reasoningPersist);
            window.dispatchEvent(new CustomEvent('cf-workspace-files-updated'));
          },
        });

        const msg: GatewayWsSend = {
          type: 'chat:send',
          requestId,
          conversationId: sessionId,
          text: content,
          mode: actualMode,
          intent,
          ...(autoPick ? { autoPick: autoPick } : {}),
          ...(policyOverrides ? { policyOverrides } : {}),
          ...(modelId ? { modelId } : {}),
        };
        ws.send(JSON.stringify(msg));
        return;
      }

      const { actual: ipcMode } = resolveEnginePlanMultitask(interactionMode, content);
      const response = await window.electronAPI?.engineSendMessage?.({
        conversationId: sessionId,
        userText: content,
        mode: ipcMode,
        ...(modelId ? { modelId } : {}),
      });
      const t1 = performance.now();

      const replyText =
        (typeof response?.message === 'string' && response.message) ||
        (typeof response === 'string' && response) ||
        `这是对"${content}"的回复（模拟）`;

      cancelAssistantReveal();

      set({ streamingActivity: '', streamingThinking: null });
      // eslint-disable-next-line no-console
      console.debug('[chat-debug] send(reveal)', {
        conversationId: sessionId,
        mode: interactionMode,
        modelId: modelId ?? null,
        textLen: content.length,
        replyLen: replyText.length,
      });

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
        if (stopped) return;
        const u = Math.min(1, (performance.now() - revealStart) / revealDurationMs);
        const smooth = u * u * (3 - 2 * u);
        const n = Math.min(replyText.length, Math.max(0, Math.round(replyText.length * smooth)));
        set({ streamingActivity: replyText.slice(0, n), streamingThinking: null });
        if (u >= 1) {
          revealCleanup = null;
          finalizeReply(replyText, { ipcMs: Math.round(t1 - t0), label: 'reveal' });
          return;
        }
        raf = requestAnimationFrame(tick);
      };

      raf = requestAnimationFrame(tick);
    } catch (error: any) {
      cancelAssistantReveal();
      set({
        isLoading: false,
        streamingActivity: null,
        streamingThinking: null,
        error: error?.message || '发送消息失败',
      });
    }
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
};
});

export default useChatStore;
