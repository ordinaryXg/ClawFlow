import { FC, useMemo } from 'react';
import { useChatStore } from '../../store/modules/chatStore';
import MessageList from '../../components/chat/MessageList';
import ChatInput from '../../components/chat/ChatInput';
import StreamingMessage from '../../components/chat/StreamingMessage';
import './styles.css';

const ChatPage: FC = () => {
  const {
    conversations,
    activeConversationId,
    messages,
    isLoading,
    streamingMessage,
    error,
    createConversation,
    switchConversation,
    deleteConversation,
    sendMessage,
    setError,
  } = useChatStore();

  const activeConversation = useMemo(
    () => conversations.find((c) => c.id === activeConversationId) ?? null,
    [conversations, activeConversationId]
  );

  const onNewConversation = () => {
    createConversation();
    (window as any).__cf_toast?.success?.('已新建对话', '你可以立即开始输入。');
  };

  const onDeleteConversation = (id: string) => {
    deleteConversation(id);
    (window as any).__cf_toast?.success?.('已删除对话', '对话已从本地移除。');
  };

  const onSend = async (content: string) => {
    await sendMessage(content);
  };

  return (
    <div className="cf-chatPage">
      <aside className="cf-chatPage__sidebar">
        <div className="cf-chatPage__sidebarHeader">
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <b style={{ fontSize: 12 }}>会话</b>
            <span className="cf-sub">组织不同主题</span>
          </div>
          <button className="cf-btn cf-btnPrimary cf-btnSmall" onClick={onNewConversation}>
            新建
          </button>
        </div>

        <div className="cf-chatPage__sidebarSearch">
          <input className="cf-input" placeholder="搜索（暂未实现）" disabled />
        </div>

        <div className="cf-chatPage__sidebarList">
          {conversations.length === 0 ? (
            <div className="cf-chatPage__sidebarEmpty">
              <div className="cf-card" style={{ width: '100%' }}>
                <h3 style={{ marginBottom: 6 }}>暂无对话</h3>
                <div className="cf-sub">创建第一个会话开始使用。</div>
                <div style={{ height: 12 }} />
                <button className="cf-btn cf-btnPrimary" onClick={onNewConversation}>
                  创建第一个对话
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
                        <div className="cf-convItem__title">{conv.title || '未命名对话'}</div>
                        <div className="cf-convItem__meta">{conv.messages.length} 条消息</div>
                      </div>
                      <button
                        className="cf-btn cf-btnGhost cf-btnSmall"
                        onClick={(e) => {
                          e.stopPropagation();
                          const ok = window.confirm('删除该对话？此操作不可恢复。');
                          if (ok) onDeleteConversation(conv.id);
                        }}
                        title="删除对话"
                      >
                        删除
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
            <b style={{ fontSize: 12 }}>{activeConversation?.title ?? '未选择对话'}</b>
            {isLoading ? <span className="cf-sub">（响应中…）</span> : null}
          </div>
          {error ? (
            <div className="cf-chatPage__error">
              <span className="cf-errorText">{error}</span>
              <button className="cf-btn cf-btnGhost cf-btnSmall" onClick={() => setError(null)}>
                清除
              </button>
            </div>
          ) : null}
        </header>

        <div className="cf-chatPage__messages">
          {messages.length === 0 && !streamingMessage ? (
            <div className="cf-chatPage__emptyMain">
              <div className="cf-card" style={{ maxWidth: 520 }}>
                <h3 style={{ marginBottom: 6 }}>开始一个对话</h3>
                <div className="cf-sub">在下方输入消息并发送；支持 Enter 发送、Shift+Enter 换行。</div>
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
          <ChatInput disabled={isLoading} onSend={onSend} />
        </footer>
      </section>
    </div>
  );
};

export default ChatPage;

