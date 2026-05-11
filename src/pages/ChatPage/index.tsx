import { FC, useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import SubAgentsHubPanel from '../../components/workspace-hub/SubAgentsHubPanel';
import SkillsHubPanel from '../../components/workspace-hub/SkillsHubPanel';
import KnowledgeBaseHubPanel from '../../components/workspace-hub/KnowledgeBaseHubPanel';
import { useWorkspaceHubStore } from '../../store/modules/workspaceHubStore';
import { useShellLayoutVariant } from '../../context/ShellLayoutContext';
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
    interactionMode,
    setInteractionMode,
    toolApprovalPending,
    respondToolApproval,
  } = useChatStore();

  const toolApprovalForActive =
    toolApprovalPending &&
    activeConversationId &&
    toolApprovalPending.conversationId === activeConversationId
      ? toolApprovalPending
      : null;

  const [modelRows, setModelRows] = useState<Array<{ id: string; label: string; available: boolean }>>([]);
  const [modelId, setModelId] = useState<string | null>(null);
  const activeWorkspacePath = useWorkspaceStore((s) => s.activePath);
  const hubBranch = useWorkspaceHubStore((s) => s.getHubBranch(activeWorkspacePath));
  const setWorkspaceHubBranch = useWorkspaceHubStore((s) => s.setHubBranch);
  const updateSettings = useSettingsStore((s) => s.updateSettings);
  const chatIntent = useSettingsStore((s) => s.chatIntent);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
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
      setModelId(id);
      if (id && id.trim()) updateSettings({ builtinDefaultModelId: id.trim() });
    },
    [updateSettings]
  );

  useEffect(() => {
    void fetchConversations();
  }, [fetchConversations, activeWorkspacePath]);

  // 自动下拉：只有当用户在底部附近时才跟随输出，避免用户上翻阅读时被强制拉回。
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
  }, []);

  useEffect(() => {
    if (!stickToBottomRef.current) return;
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length, streamingActivity, streamingThinking]);

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
      const ids = new Set(filtered.map((o) => o.id));
      const savedId = useSettingsStore.getState().builtinDefaultModelId?.trim() ?? '';
      const defaultFromEngine = typeof res?.defaultModelId === 'string' ? res.defaultModelId.trim() : '';
      const firstAvail = filtered.find((m) => m.available)?.id;
      let picked: string | null = null;
      if (savedId && ids.has(savedId)) picked = savedId;
      else if (defaultFromEngine && ids.has(defaultFromEngine)) picked = defaultFromEngine;
      else if (firstAvail && ids.has(firstAvail)) picked = firstAvail;
      else picked = filtered[0]?.id ?? null;
      setModelId((prev) => {
        if (prev && ids.has(prev)) return prev;
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

  const modelsForSelect = useMemo(
    () =>
      modelRows.map((m) => ({
        id: m.id,
        label: m.available ? m.label : `${m.label} · ${t('settings.modelUnavailable')}`,
      })),
    [modelRows, t]
  );

  const showApiKeyBar = modelRows.length > 0 && !modelRows.some((m) => m.available);

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
    } else if (hubBranch === 'subagents') hubBody = <SubAgentsHubPanel />;
    else if (hubBranch === 'skills') hubBody = <SkillsHubPanel />;
    else hubBody = <KnowledgeBaseHubPanel />;

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
            <b style={{ fontSize: 12 }}>{activeConversation?.title ?? t('chat.noSessionSelected')}</b>
            {isLoading ? <span className="cf-sub">{t('chat.responding')}</span> : null}
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
            <span className="cf-chatCenter__sessionHintTitle">{activeConversation?.title ?? t('chat.noSessionSelected')}</span>
            {isLoading ? <span className="cf-sub">{t('chat.responding')}</span> : null}
          </div>
        </>
      )}

      <div ref={scrollRef} className="cf-chatCenter__messages">
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
            <MessageList messages={messages} />
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
          <ChatApiKeyBar
            visible={showApiKeyBar}
            onSaved={() => void reloadChatModels()}
            onOpenFullSettings={() => navigate('/settings')}
          />
          <ChatInput
            disabled={isLoading}
            onSend={onSend}
            models={modelsForSelect}
            modelId={modelId}
            onModelChange={handleModelChange}
            interactionMode={interactionMode}
            onInteractionModeChange={setInteractionMode}
            intent={chatIntent}
            onIntentChange={(v) => updateSettings({ chatIntent: v })}
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
