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
    switchConversation,
    deleteConversation,
    sendMessage,
    setError,
  } = useChatStore();

  const [models, setModels] = useState<Array<{ id: string; label: string }>>([]);
  const [modelId, setModelId] = useState<string | null>(null);
  const activeWorkspacePath = useWorkspaceStore((s) => s.activePath);

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

  const onDeleteConversation = (id: string) => {
    deleteConversation(id);
    (window as any).__cf_toast?.success?.(t('chat.deletedTitle'), t('chat.deletedBody'));
  };

  const onSend = async (content: string) => {
    await sendMessage(content, modelId);
  };

  return (
    <div className="cf-chatCenter">
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

      <div className="cf-chatCenter__messages">
        {messages.length === 0 && !streamingMessage ? (
          <div className="cf-chatCenter__empty">
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

      <footer className="cf-chatCenter__input">
        <ChatInput
          disabled={isLoading}
          onSend={onSend}
          models={models}
          modelId={modelId}
          onModelChange={setModelId}
        />
      </footer>
    </div>
  );
};

export default ChatPage;
