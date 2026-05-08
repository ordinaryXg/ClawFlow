import { FC, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useChatStore } from '../../store/modules/chatStore';
import { useWorkspaceStore } from '../../store/modules/workspaceStore';
import MessageList from '../../components/chat/MessageList';
import ChatInput from '../../components/chat/ChatInput';
import StreamingMessage from '../../components/chat/StreamingMessage';
import ChatRightTabs from '../../components/chat/ChatRightTabs';
import './styles.css';

const ChatPage: FC = () => {
  const { t } = useTranslation();
  const {
    conversations,
    activeConversationId,
    messages,
    isLoading,
    streamingMessage,
    error,
    fetchConversations,
    switchConversation,
    deleteConversation,
    sendMessage,
    setError,
  } = useChatStore();

  const [models, setModels] = useState<Array<{ id: string; label: string }>>([]);
  const [modelId, setModelId] = useState<string | null>(null);
  const activeWorkspacePath = useWorkspaceStore((s) => s.activePath);
  const workspaceMeta = useWorkspaceStore((s) => s.meta);
  const workspaceRecent = useWorkspaceStore((s) => s.recent);
  const pickWorkspaceFolder = useWorkspaceStore((s) => s.pickFolder);
  const setWorkspace = useWorkspaceStore((s) => s.setWorkspace);
  const refreshWorkspace = useWorkspaceStore((s) => s.refresh);
  const workspaceLoading = useWorkspaceStore((s) => s.loading);

  const [workspacesExpanded, setWorkspacesExpanded] = useState(true);

  useEffect(() => {
    void fetchConversations();
  }, [fetchConversations, activeWorkspacePath]);

  useEffect(() => {
    void (async () => {
      try {
        const res = await window.electronAPI?.getModels?.();
        const defaultId = typeof res?.defaultModelId === 'string' ? res.defaultModelId : null;
        const list = Array.isArray(res?.models) ? res.models : [];
        const opts = list
          .map((m: any) => {
            const id = String(m?.id ?? '').trim();
            if (!id) return null;
            return { id, label: id };
          })
          .filter(Boolean) as Array<{ id: string; label: string }>;
        setModels(opts);
        setModelId(defaultId);
      } catch {
        setModels([]);
        setModelId(null);
      }
    })();
  }, [activeWorkspacePath]);

  const activeConversation = useMemo(
    () => conversations.find((c) => c.id === activeConversationId) ?? null,
    [conversations, activeConversationId]
  );

  const workspaceLabel =
    (workspaceMeta?.name && String(workspaceMeta.name).trim()) ||
    (activeWorkspacePath ? String(activeWorkspacePath).replace(/[/\\]+$/, '').split(/[/\\]/).pop() || '' : '') ||
    t('workspace.default');

  const onNewWorkspace = async () => {
    await pickWorkspaceFolder();
    await refreshWorkspace();
  };

  const onDeleteConversation = (id: string) => {
    deleteConversation(id);
    (window as any).__cf_toast?.success?.(t('chat.deletedTitle'), t('chat.deletedBody'));
  };

  const onSend = async (content: string) => {
    await sendMessage(content, modelId);
  };

  return (
    <div className="cf-chatPage">
      <aside className="cf-chatPage__sidebar">
        <div className="cf-chatPage__sidebarHeader">
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <b style={{ fontSize: 12 }}>{t('chat.sessions')}</b>
            <span className="cf-sub">{t('chat.sessionsSub')}</span>
          </div>
          <button className="cf-btn cf-btnPrimary cf-btnSmall" onClick={() => void onNewWorkspace()}>
            {t('chat.newWorkspace')}
          </button>
        </div>

        <div className="cf-chatPage__sidebarList">
          <div className="cf-wsCard">
            <button
              type="button"
              className="cf-wsCard__hd"
              onClick={() => setWorkspacesExpanded((v) => !v)}
              aria-expanded={workspacesExpanded}
            >
              <span className="cf-wsCard__title">{t('workspace.title')}</span>
              <span className="cf-wsCard__active" title={activeWorkspacePath ?? ''}>
                {workspaceLabel}
              </span>
              <span className="cf-wsCard__chev" aria-hidden>
                ▾
              </span>
            </button>
            {workspacesExpanded ? (
              <div className="cf-wsCard__bd">
                <div className="cf-wsList">
                  {workspaceLoading ? (
                    <div className="cf-wsLoading">
                      <span className="cf-loading__spinner" />
                      <span className="cf-sub">{t('chat.switchingWorkspace')}</span>
                    </div>
                  ) : null}
                  {(workspaceRecent ?? []).map((p) => {
                    const isActive = Boolean(activeWorkspacePath && p === activeWorkspacePath);
                    return (
                      <button
                        key={p}
                        type="button"
                        className={isActive ? 'cf-wsItem cf-wsItem--active' : 'cf-wsItem'}
                        onClick={() => void setWorkspace(p)}
                        title={p}
                      >
                        {String(p).replace(/[/\\]+$/, '').split(/[/\\]/).pop() || p}
                      </button>
                    );
                  })}
                </div>

                <div className="cf-wsChildren">
                  <div className="cf-wsChildren__hd">
                    <span className="cf-sub">{t('chat.sessions')}</span>
                  </div>

                  <div className="cf-wsChildren__bd">
                    {conversations.length === 0 ? (
                      <div className="cf-chatPage__sidebarEmpty">
                        <div className="cf-card" style={{ width: '100%' }}>
                          <h3 style={{ marginBottom: 6 }}>{t('chat.noConversations')}</h3>
                          <div className="cf-sub">{t('chat.noConversationsSub')}</div>
                          <div style={{ height: 12 }} />
                          <div className="cf-sub">{t('chat.createFirstHint')}</div>
                        </div>
                      </div>
                    ) : (
                      <div className="cf-convList">
                        {[...conversations]
                          .sort((a, b) => b.updatedAt - a.updatedAt)
                          .map((conv) => {
                            const isActive = conv.id === activeConversationId;
                            return (
                              <div
                                key={conv.id}
                                className={isActive ? 'cf-convItem cf-convItem--active' : 'cf-convItem'}
                                role="button"
                                tabIndex={0}
                                onClick={() => switchConversation(conv.id)}
                              >
                                <div className="cf-convItem__content">
                                  <div className="cf-convItem__title">{conv.title || t('chat.unnamed')}</div>
                                  <div className="cf-convItem__meta">{t('chat.msgCount', { count: conv.messages.length })}</div>
                                </div>
                                <button
                                  className="cf-btn cf-btnGhost cf-btnSmall"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const ok = window.confirm(t('chat.confirmDelete'));
                                    if (ok) onDeleteConversation(conv.id);
                                  }}
                                  title={t('chat.deleteSession')}
                                >
                                  {t('common.delete')}
                                </button>
                              </div>
                            );
                          })}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </aside>

      <section className="cf-chatPage__main">
        <div className="cf-chatPage__mainGrid">
          <div className="cf-chatPage__chatCol">
            <header className="cf-chatPage__mainHeader">
              <div className="cf-chatPage__title">
                <b style={{ fontSize: 12 }}>{activeConversation?.title ?? t('chat.noSessionSelected')}</b>
                {isLoading ? <span className="cf-sub">{t('chat.responding')}</span> : null}
              </div>
              {error ? (
                <div className="cf-chatPage__error">
                  <span className="cf-errorText">{error}</span>
                  <button className="cf-btn cf-btnGhost cf-btnSmall" onClick={() => setError(null)}>
                    {t('common.clear')}
                  </button>
                </div>
              ) : null}
            </header>

            <div className="cf-chatPage__messages">
              {messages.length === 0 && !streamingMessage ? (
                <div className="cf-chatPage__emptyMain">
                  <div className="cf-card" style={{ maxWidth: 520 }}>
                    <h3 style={{ marginBottom: 6 }}>{t('chat.emptyMainTitle')}</h3>
                    <div className="cf-sub">{t('chat.emptyMainSub')}</div>
                  </div>
                </div>
              ) : (
                <>
                  <MessageList messages={messages} />
                  <StreamingMessage content={streamingMessage} />
                </>
              )}
            </div>

            <footer className="cf-chatPage__input">
              <ChatInput
                disabled={isLoading}
                onSend={onSend}
                models={models}
                modelId={modelId}
                onModelChange={setModelId}
              />
            </footer>
          </div>

          <ChatRightTabs workspacePath={activeWorkspacePath} />
        </div>
      </section>
    </div>
  );
};

export default ChatPage;
