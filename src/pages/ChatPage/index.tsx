import { FC, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useChatStore } from '../../store/modules/chatStore';
import { useWorkspaceStore } from '../../store/modules/workspaceStore';
import MessageList from '../../components/chat/MessageList';
import ChatInput from '../../components/chat/ChatInput';
import StreamingMessage from '../../components/chat/StreamingMessage';
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
    createConversation,
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

  const workspaceLocked = (activeConversation?.messages?.length ?? 0) > 0;

  const onNewConversation = () => {
    createConversation();
    (window as any).__cf_toast?.success?.(t('chat.createdTitle'), t('chat.createdBody'));
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
          <button className="cf-btn cf-btnPrimary cf-btnSmall" onClick={onNewConversation}>
            {t('chat.new')}
          </button>
        </div>

        <div className="cf-chatPage__sidebarSearch">
          <input className="cf-input" placeholder={t('chat.searchPlaceholder')} disabled />
        </div>

        <div className="cf-chatPage__sidebarList">
          {conversations.length === 0 ? (
            <div className="cf-chatPage__sidebarEmpty">
              <div className="cf-card" style={{ width: '100%' }}>
                <h3 style={{ marginBottom: 6 }}>{t('chat.noConversations')}</h3>
                <div className="cf-sub">{t('chat.noConversationsSub')}</div>
                <div style={{ height: 12 }} />
                <button className="cf-btn cf-btnPrimary" onClick={onNewConversation}>
                  {t('chat.createFirst')}
                </button>
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
                        <div className="cf-convItem__meta">
                          {t('chat.msgCount', { count: conv.messages.length })}
                        </div>
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
      </aside>

      <section className="cf-chatPage__main">
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
            workspaceLabel={workspaceLabel}
            workspaceRecent={workspaceRecent}
            workspaceLocked={workspaceLocked}
            onWorkspacePick={pickWorkspaceFolder}
            onWorkspaceSelect={setWorkspace}
          />
        </footer>
      </section>
    </div>
  );
};

export default ChatPage;
