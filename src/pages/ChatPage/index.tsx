import { FC, useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useChatStore } from '../../store/modules/chatStore';
import { useSettingsStore } from '../../store/modules/settingsStore';
import { useWorkspaceStore } from '../../store/modules/workspaceStore';
import MessageList from '../../components/chat/MessageList';
import ChatInput from '../../components/chat/ChatInput';
import ChatApiKeyBar from '../../components/chat/ChatApiKeyBar';
import StreamingMessage from '../../components/chat/StreamingMessage';
import './styles.css';

const ChatPage: FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
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
    interactionMode,
    setInteractionMode,
  } = useChatStore();

  const [modelRows, setModelRows] = useState<Array<{ id: string; label: string; available: boolean }>>([]);
  const [modelId, setModelId] = useState<string | null>(null);
  const activeWorkspacePath = useWorkspaceStore((s) => s.activePath);
  const updateSettings = useSettingsStore((s) => s.updateSettings);

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
        {messages.length === 0 && streamingMessage === null ? (
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
        />
      </footer>
    </div>
  );
};

export default ChatPage;
