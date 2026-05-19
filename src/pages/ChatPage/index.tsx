import { FC, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useChatStore } from '../../store/modules/chatStore';
import { useSettingsStore } from '../../store/modules/settingsStore';
import { useWorkspaceStore } from '../../store/modules/workspaceStore';
import MessageList from '../../components/chat/MessageList';
import ChatInput from '../../components/chat/ChatInput';
import ChatApiKeyBar from '../../components/chat/ChatApiKeyBar';
import StreamingMessage from '../../components/chat/StreamingMessage';
import ToolApprovalBar from '../../components/chat/ToolApprovalBar';
import TodoTriggersStickyFloat from '../../components/chat/TodoTriggersStickyFloat';
import TodoTriggersPanel from '../../components/chat/TodoTriggersPanel';
import SkillsHubPanel from '../../components/workspace-hub/SkillsHubPanel';
import KnowledgeBaseHubPanel from '../../components/workspace-hub/KnowledgeBaseHubPanel';
import { useWorkspaceHubStore } from '../../store/modules/workspaceHubStore';
import { useShellLayoutVariant } from '../../context/ShellLayoutContext';
import {
  computeContextSaturation,
  estimateMessagesContextTokens,
  resolveContextTokenLimit,
} from '../../utils/context-saturation';
import { formatUtf8Bytes } from '../../utils/format-bytes';
import { normalizeToProviderRepresentative, pickGroupedCatalogModelId } from '../../engine/chat-model-catalog';
import {
  OUTBOUND_MERGE_WINDOW_PREFS_EVENT,
  refreshOutboundMergeWindowMsFromEngine,
} from '../../shared/outbound-merge-window-client';
import ModeClassificationDebug from '../../components/chat/ModeClassificationDebug';
import ExpectationPlanningPanel from '../../components/chat/ExpectationPlanningPanel';
import {
  DEFAULT_SYSTEM_AGENT_SETTINGS,
  SYSTEM_AGENT_SETTINGS_BROADCAST,
} from '../../shared/system-agent-settings';
import PendingSendQueue from '../../components/chat/PendingSendQueue';
import './styles.css';

const CHAT_FOOTER_HEIGHT_KEY = 'clawflow.chatFooterHeightPx';
const DEFAULT_CHAT_FOOTER_PX = 220;
const MIN_CHAT_FOOTER_PX = 140;
const MIN_CHAT_MESSAGES_PX = 80;
const RESIZE_HANDLE_PX = 6;

const ChatPage: FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const shellVariant = useShellLayoutVariant();
  const isAlternateShell = shellVariant === 'alternate';
  const {
    conversations,
    activeConversationId,
    messages,
    isLoading,
    streamingActivity,
    streamingThinking,
    error,
    fetchConversations,
    switchConversation,
    deleteConversation,
    sendMessage,
    setError,
    activeModeClassification,
    isClassifyingMode,
    isExpectationPlanning,
    expectationPlanStream,
    activeExpectationPlanDisplay,
    pendingSendQueue,
    removePendingSend,
    toolApprovalPending,
    respondToolApproval,
  } = useChatStore(
    useShallow((s) => ({
      conversations: s.conversations,
      activeConversationId: s.activeConversationId,
      messages: s.messages,
      isLoading: s.isLoading,
      streamingActivity: s.streamingActivity,
      streamingThinking: s.streamingThinking,
      error: s.error,
      fetchConversations: s.fetchConversations,
      switchConversation: s.switchConversation,
      deleteConversation: s.deleteConversation,
      sendMessage: s.sendMessage,
      setError: s.setError,
      activeModeClassification: s.activeModeClassification,
      isClassifyingMode: s.isClassifyingMode,
      isExpectationPlanning: s.isExpectationPlanning,
      expectationPlanStream: s.expectationPlanStream,
      activeExpectationPlanDisplay: s.activeExpectationPlanDisplay,
      pendingSendQueue: s.pendingSendQueue,
      removePendingSend: s.removePendingSend,
      toolApprovalPending: s.toolApprovalPending,
      respondToolApproval: s.respondToolApproval,
    }))
  );

  const toolApprovalForActive =
    toolApprovalPending &&
    activeConversationId &&
    toolApprovalPending.conversationId === activeConversationId
      ? toolApprovalPending
      : null;

  const [showModeClassificationDebug, setShowModeClassificationDebug] = useState(
    DEFAULT_SYSTEM_AGENT_SETTINGS.showModeClassificationDebug
  );
  const [modelRows, setModelRows] = useState<Array<{ id: string; label: string; available: boolean }>>([]);
  const [modelId, setModelId] = useState<string | null>(null);
  const [nextCtx, setNextCtx] = useState<{
    utf8Bytes: number;
    loadUnits: number;
    budgetUnits: number;
    ratio: number;
    isOverflow: boolean;
    isNearOverflow: boolean;
  } | null>(null);
  const [nextCtxLoading, setNextCtxLoading] = useState(false);
  const [nextCtxErr, setNextCtxErr] = useState<string | null>(null);
  const activeWorkspacePath = useWorkspaceStore((s) => s.activePath);
  const hubBranch = useWorkspaceHubStore((s) => s.getHubBranch(activeWorkspacePath));
  const setWorkspaceHubBranch = useWorkspaceHubStore((s) => s.setHubBranch);
  const updateSettings = useSettingsStore((s) => s.updateSettings);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [messagesScrollEl, setMessagesScrollEl] = useState<HTMLDivElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const stickToBottomRef = useRef(true);
  const resizeDragRef = useRef<{ startY: number; startH: number } | null>(null);
  const footerHeightRef = useRef(DEFAULT_CHAT_FOOTER_PX);

  const [inputPanelHeightPx, setInputPanelHeightPx] = useState(() => {
    try {
      const raw = localStorage.getItem(CHAT_FOOTER_HEIGHT_KEY);
      const n = raw ? Number.parseInt(raw, 10) : NaN;
      if (Number.isFinite(n)) return Math.max(MIN_CHAT_FOOTER_PX, n);
    } catch {
      /* ignore */
    }
    return DEFAULT_CHAT_FOOTER_PX;
  });

  const clampFooterHeight = useCallback((h: number) => {
    const root = rootRef.current;
    if (!root) return Math.max(MIN_CHAT_FOOTER_PX, Math.min(720, h));
    const headerEl = root.querySelector('.cf-chatCenter__header');
    const headerH = headerEl?.getBoundingClientRect().height ?? 52;
    const inner = root.getBoundingClientRect().height - headerH - RESIZE_HANDLE_PX;
    /** 为消息区至少保留 MIN_CHAT_MESSAGES_PX；窗口极小时允许输入区略低于理想最小值 */
    const maxFooter = Math.max(96, inner - MIN_CHAT_MESSAGES_PX);
    return Math.max(96, Math.min(maxFooter, h));
  }, []);

  useEffect(() => {
    const applyFromOverview = async () => {
      try {
        const res = await window.electronAPI?.systemAgentsGetOverview?.();
        if (res && 'ok' in res && res.ok && res.settings && typeof res.settings === 'object') {
          const dbg = (res.settings as { showModeClassificationDebug?: boolean }).showModeClassificationDebug;
          if (typeof dbg === 'boolean') setShowModeClassificationDebug(dbg);
        }
      } catch {
        /* ignore */
      }
    };
    void applyFromOverview();
    const onCustom = () => void applyFromOverview();
    window.addEventListener(SYSTEM_AGENT_SETTINGS_BROADCAST, onCustom);
    const offIpc = window.electronAPI?.onSystemAgentsSettingsUpdated?.(onCustom);
    return () => {
      window.removeEventListener(SYSTEM_AGENT_SETTINGS_BROADCAST, onCustom);
      offIpc?.();
    };
  }, []);

  useEffect(() => {
    footerHeightRef.current = inputPanelHeightPx;
  }, [inputPanelHeightPx]);

  useEffect(() => {
    setInputPanelHeightPx((prev) => {
      const c = clampFooterHeight(prev);
      return c === prev ? prev : c;
    });
  }, [clampFooterHeight]);

  useEffect(() => {
    const onWinResize = () =>
      setInputPanelHeightPx((prev) => {
        const c = clampFooterHeight(prev);
        return c === prev ? prev : c;
      });
    window.addEventListener('resize', onWinResize);
    return () => window.removeEventListener('resize', onWinResize);
  }, [clampFooterHeight]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      setInputPanelHeightPx((prev) => {
        const c = clampFooterHeight(prev);
        return c === prev ? prev : c;
      });
    });
    ro.observe(root);
    return () => ro.disconnect();
  }, [clampFooterHeight]);

  const handleModelChange = useCallback(
    (id: string | null) => {
      const norm = id?.trim() ? normalizeToProviderRepresentative(id.trim()) : null;
      setModelId(norm);
      if (norm) updateSettings({ builtinDefaultModelId: norm });
    },
    [updateSettings]
  );

  useEffect(() => {
    void fetchConversations();
  }, [fetchConversations, activeWorkspacePath]);

  // 自动下拉：只有当用户在底部附近时才跟随输出，避免用户上翻阅读时被强制拉回。
  const assignMessagesScrollRef = useCallback((el: HTMLDivElement | null) => {
    scrollRef.current = el;
    setMessagesScrollEl(el);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
      stickToBottomRef.current = distance < 120;
    };
    onScroll();
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll as any);
  }, [messagesScrollEl]);

  useEffect(() => {
    if (!stickToBottomRef.current) return;
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length, streamingActivity, streamingThinking]);

  /** 从待办等视图切回会话时，强制对齐到对话末尾（双帧与短延迟覆盖布局未成时刻） */
  useEffect(() => {
    if (hubBranch !== 'sessions') return;
    stickToBottomRef.current = true;
    let alive = true;
    const bump = () => {
      if (!alive) return;
      const el = scrollRef.current;
      if (el) el.scrollTop = el.scrollHeight;
      bottomRef.current?.scrollIntoView({ block: 'end' });
    };
    requestAnimationFrame(() => requestAnimationFrame(bump));
    const t = window.setTimeout(bump, 120);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [hubBranch]);

  const reloadChatModels = useCallback(async () => {
    try {
      const res = await window.electronAPI?.engineGetChatModels?.();
      const list = Array.isArray(res?.models)
        ? res.models.map((m: { id: string; label: string; available?: boolean }) => ({
            id: String(m?.id ?? '').trim(),
            label: String(m?.label ?? m?.id ?? '').trim() || String(m?.id ?? ''),
            available: m?.available !== false,
          }))
        : [];
      const filtered = list.filter((m) => m.id);
      setModelRows(filtered);
      const savedId = useSettingsStore.getState().builtinDefaultModelId?.trim() ?? '';
      const defaultFromEngine = typeof res?.defaultModelId === 'string' ? res.defaultModelId.trim() : '';
      const picked = pickGroupedCatalogModelId(savedId, filtered, defaultFromEngine);
      setModelId((prev) => {
        if (!prev) return picked;
        const normPrev = normalizeToProviderRepresentative(prev);
        const ids = new Set(filtered.map((o) => o.id));
        if (ids.has(normPrev)) return normPrev;
        return picked;
      });
    } catch {
      setModelRows([]);
      setModelId(null);
    }
  }, []);

  useEffect(() => {
    void reloadChatModels();
  }, [reloadChatModels, activeWorkspacePath]);

  useEffect(() => {
    void refreshOutboundMergeWindowMsFromEngine();
    const onPrefs = () => void refreshOutboundMergeWindowMsFromEngine();
    window.addEventListener(OUTBOUND_MERGE_WINDOW_PREFS_EVENT, onPrefs);
    return () => window.removeEventListener(OUTBOUND_MERGE_WINDOW_PREFS_EVENT, onPrefs);
  }, []);

  const modelsForSelect = useMemo(
    () =>
      modelRows.map((m) => ({
        id: m.id,
        label: m.available ? m.label : `${m.label} · ${t('settings.modelUnavailable')}`,
      })),
    [modelRows, t]
  );

  const contextSaturation = useMemo(() => computeContextSaturation(messages, modelId), [messages, modelId]);
  const contextUsedApprox = useMemo(() => estimateMessagesContextTokens(messages), [messages]);
  const contextLimitApprox = useMemo(() => resolveContextTokenLimit(modelId), [modelId]);

  /** 仅在「非生成中」对消息列表做指纹：生成中不随流式/中间态触发主进程估算，结束后一次性更新。 */
  const committedMessagesDigest = useMemo(() => {
    if (isLoading) return '__loading__';
    return messages
      .map((m) => `${m.id}:${String(m.content ?? '').length}:${String(m.reasoningContent ?? '').length}`)
      .join('\u001f');
  }, [messages, isLoading]);

  useEffect(() => {
    const api = window.electronAPI?.engineEstimateNextRequestContext;
    if (!api) {
      setNextCtx(null);
      setNextCtxLoading(false);
      setNextCtxErr(null);
      return;
    }
    if (!activeConversationId?.trim() || !activeWorkspacePath?.trim()) {
      setNextCtx(null);
      setNextCtxLoading(false);
      setNextCtxErr(null);
      return;
    }
    if (isLoading) {
      setNextCtxLoading(false);
      setNextCtxErr(null);
      return;
    }
    let cancelled = false;
    setNextCtxLoading(true);
    setNextCtxErr(null);
    void (async () => {
      try {
        const r = await api({
          conversationId: activeConversationId,
          pendingUserText: '',
          modelId: modelId ?? null,
        });
        if (cancelled) return;
        if (r.ok) {
          setNextCtx({
            utf8Bytes: r.utf8Bytes,
            loadUnits: r.loadUnits,
            budgetUnits: r.budgetUnits,
            ratio: r.ratio,
            isOverflow: r.isOverflow,
            isNearOverflow: r.isNearOverflow,
          });
        } else {
          setNextCtx(null);
          setNextCtxErr(r.error);
        }
      } catch (e: unknown) {
        if (!cancelled) {
          setNextCtx(null);
          setNextCtxErr(e instanceof Error ? e.message : String(e));
        }
      } finally {
        if (!cancelled) setNextCtxLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeConversationId, activeWorkspacePath, modelId, committedMessagesDigest, isLoading]);

  const contextMeterRatio = useMemo(() => {
    if (nextCtx && nextCtx.budgetUnits > 0) return Math.min(1, nextCtx.loadUnits / nextCtx.budgetUnits);
    return contextSaturation;
  }, [nextCtx, contextSaturation]);

  const contextMeterTitle = useMemo(() => {
    if (!nextCtx) return undefined;
    return t('chat.contextMeterTitleNext', {
      pct: Math.min(999, Math.round((nextCtx.loadUnits / nextCtx.budgetUnits) * 100)),
      load: nextCtx.loadUnits.toLocaleString(),
      budget: nextCtx.budgetUnits.toLocaleString(),
      bytes: formatUtf8Bytes(nextCtx.utf8Bytes),
    });
  }, [nextCtx, t]);

  const showApiKeyBar = modelRows.length > 0 && !modelRows.some((m) => m.available);

  /** 顶栏：发送后先「等待回复」，出现流式内容后「正在输入」，结束后清空 */
  const chatStreamHeaderStatus = useMemo<'idle' | 'waiting' | 'typing'>(() => {
    if (!isLoading) return 'idle';
    const act = typeof streamingActivity === 'string' ? streamingActivity.trim() : '';
    const think = typeof streamingThinking === 'string' ? streamingThinking.trim() : '';
    if (act.length > 0 || think.length > 0) return 'typing';
    return 'waiting';
  }, [isLoading, streamingActivity, streamingThinking]);

  const chatHeaderStatusRow = (
    <>
      <span className="cf-chatCenter__sessionWord">{t('chat.headerSession')}</span>
      {chatStreamHeaderStatus === 'waiting' ? (
        <span className="cf-chatCenter__streamStatus cf-chatCenter__streamStatus--wait">{t('chat.statusWaitingReply')}</span>
      ) : null}
      {chatStreamHeaderStatus === 'typing' ? (
        <span className="cf-chatCenter__streamStatus cf-chatCenter__streamStatus--typing">{t('chat.statusTyping')}</span>
      ) : null}
    </>
  );

  const activeConversation = useMemo(
    () => conversations.find((c) => c.id === activeConversationId) ?? null,
    [conversations, activeConversationId]
  );

  const onDeleteConversation = (id: string) => {
    deleteConversation(id);
    (window as any).__cf_toast?.success?.(t('chat.deletedTitle'), t('chat.deletedBody'));
  };

  const onSend = async (content: string) => {
    await sendMessage(content, modelId);
  };

  const onResizePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    resizeDragRef.current = { startY: e.clientY, startH: footerHeightRef.current };
    e.currentTarget.setPointerCapture(e.pointerId);
    e.currentTarget.classList.add('cf-chatCenter__resize--active');
  };

  if (hubBranch !== 'sessions') {
    let hubBody: React.ReactNode = null;
    if (hubBranch === 'todos') {
      hubBody = (
        <div className="cf-hubTodosWrap">
          <TodoTriggersPanel workspacePath={activeWorkspacePath} />
        </div>
      );
    } else if (hubBranch === 'skills') hubBody = <SkillsHubPanel workspacePath={activeWorkspacePath} />;
    else hubBody = <KnowledgeBaseHubPanel workspacePath={activeWorkspacePath} />;

    return (
      <div
        ref={rootRef}
        className={`cf-chatCenter${isAlternateShell ? ' cf-chatCenter--alternate' : ''}`}
      >
        {isAlternateShell ? (
          <div className="cf-chatCenter__hubBackWrap">
            <button
              type="button"
              className="cf-btn cf-btnGhost cf-btnSmall"
              onClick={() => {
                const wp = activeWorkspacePath?.trim();
                if (wp) setWorkspaceHubBranch(wp, 'sessions');
              }}
            >
              {t('chat.workspaceHub.backToSessions')}
            </button>
          </div>
        ) : null}
        <div className="cf-chatCenter__hubBody">{hubBody}</div>
      </div>
    );
  }

  const onResizePointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const drag = resizeDragRef.current;
    if (!drag) return;
    const dy = e.clientY - drag.startY;
    /** 与视觉直觉一致：鼠标上移增大输入区高度，下移减小（使用与 clientY 增量相反的符号） */
    const next = clampFooterHeight(drag.startH - dy);
    footerHeightRef.current = next;
    setInputPanelHeightPx(next);
  };

  const endResize = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!resizeDragRef.current) return;
    resizeDragRef.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    e.currentTarget.classList.remove('cf-chatCenter__resize--active');
    try {
      localStorage.setItem(CHAT_FOOTER_HEIGHT_KEY, String(footerHeightRef.current));
    } catch {
      /* ignore */
    }
  };

  return (
    <div ref={rootRef} className={`cf-chatCenter${isAlternateShell ? ' cf-chatCenter--alternate' : ''}`}>
      {!isAlternateShell ? (
        <header className="cf-chatCenter__header">
          <div className="cf-chatCenter__title">
            <div className="cf-chatCenter__titleBlock">
              <div className="cf-chatCenter__titleRow">{chatHeaderStatusRow}</div>
              <div className="cf-chatCenter__titleSubtitle">
                {activeConversation?.title?.trim() ? activeConversation.title : t('chat.noSessionSelected')}
              </div>
            </div>
          </div>
          {error ? (
            <div className="cf-chatCenter__error">
              <span className="cf-errorText">{error}</span>
              <button className="cf-btn cf-btnGhost cf-btnSmall" onClick={() => setError(null)}>
                {t('common.clear')}
              </button>
            </div>
          ) : null}
        </header>
      ) : (
        <>
          {error ? (
            <div className="cf-chatCenter__errorBar">
              <span className="cf-errorText">{error}</span>
              <button className="cf-btn cf-btnGhost cf-btnSmall" onClick={() => setError(null)}>
                {t('common.clear')}
              </button>
            </div>
          ) : null}
          <div className="cf-chatCenter__sessionHint" aria-live="polite">
            <div className="cf-chatCenter__sessionHintTop">
              <div className="cf-chatCenter__titleRow">{chatHeaderStatusRow}</div>
              <span className="cf-chatCenter__sessionHintTitle">
                {activeConversation?.title?.trim() ? activeConversation.title : t('chat.noSessionSelected')}
              </span>
            </div>
          </div>
        </>
      )}

      <div ref={assignMessagesScrollRef} className="cf-chatCenter__messages">
        {isAlternateShell ? <TodoTriggersStickyFloat /> : null}
        {messages.length === 0 && streamingActivity === null && !toolApprovalForActive ? (
          <div className="cf-chatCenter__empty">
            <div className="cf-card" style={{ maxWidth: 520 }}>
              <h3 style={{ marginBottom: 6 }}>{t('chat.emptyMainTitle')}</h3>
              <div className="cf-sub">{t('chat.emptyMainSub')}</div>
            </div>
          </div>
        ) : (
          <>
            <MessageList
              messages={messages}
              scrollRoot={messagesScrollEl}
              stickToBottomRef={stickToBottomRef}
              conversationId={activeConversationId}
            />
            <ExpectationPlanningPanel
              planning={isExpectationPlanning}
              streamText={expectationPlanStream}
              displayMarkdown={activeExpectationPlanDisplay}
            />
            <StreamingMessage activity={streamingActivity} thinking={streamingThinking} />
            {toolApprovalForActive ? (
              <ToolApprovalBar pending={toolApprovalForActive} onRespond={respondToolApproval} />
            ) : null}
            <div ref={bottomRef} />
          </>
        )}
      </div>

      <button
        type="button"
        className="cf-chatCenter__resize"
        aria-label={t('chat.resizeInputHeight')}
        title={t('chat.resizeInputHeightHint')}
        onPointerDown={onResizePointerDown}
        onPointerMove={onResizePointerMove}
        onPointerUp={endResize}
        onPointerCancel={endResize}
        onDoubleClick={() => {
          const next = clampFooterHeight(DEFAULT_CHAT_FOOTER_PX);
          setInputPanelHeightPx(next);
          try {
            localStorage.setItem(CHAT_FOOTER_HEIGHT_KEY, String(next));
          } catch {
            /* ignore */
          }
        }}
      />

      <footer className="cf-chatCenter__input" style={{ height: inputPanelHeightPx }}>
        <div className="cf-chatCenter__inputInner">
          {showModeClassificationDebug ? (
            <ModeClassificationDebug classifying={isClassifyingMode} classification={activeModeClassification} />
          ) : null}
          <PendingSendQueue items={pendingSendQueue} onRemove={removePendingSend} />
          <ChatApiKeyBar
            visible={showApiKeyBar}
            onSaved={() => void reloadChatModels()}
            onOpenFullSettings={() => navigate('/settings')}
          />
          <ChatInput
            disabled={isClassifyingMode || isExpectationPlanning}
            onSend={onSend}
            models={modelsForSelect}
            modelId={modelId}
            onModelChange={handleModelChange}
            contextSaturation={contextSaturation}
            contextUsedApprox={contextUsedApprox}
            contextLimitApprox={contextLimitApprox}
            contextMeterRatio={contextMeterRatio}
            contextMeterTitle={contextMeterTitle}
            nextContextPayload={nextCtx}
            nextContextLoading={nextCtxLoading}
            nextContextError={nextCtxErr}
            showStarterPrompts={
              messages.length === 0 && streamingActivity === null && !isLoading && !toolApprovalForActive
            }
          />
        </div>
      </footer>
    </div>
  );
};

export default ChatPage;
