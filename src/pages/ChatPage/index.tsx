import { FC, useMemo } from 'react';
import { Button, Empty, Input, List, Popconfirm, Typography, message as antdMessage } from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { useChatStore } from '../../store/modules/chatStore';
import MessageList from '../../components/chat/MessageList';
import ChatInput from '../../components/chat/ChatInput';
import StreamingMessage from '../../components/chat/StreamingMessage';
import './styles.css';

const { Text } = Typography;

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
  };

  const onDeleteConversation = (id: string) => {
    deleteConversation(id);
    antdMessage.success('已删除对话');
  };

  const onSend = async (content: string) => {
    await sendMessage(content);
  };

  return (
    <div className="cf-chatPage">
      <aside className="cf-chatPage__sidebar">
        <div className="cf-chatPage__sidebarHeader">
          <Text strong>对话</Text>
          <Button size="small" type="primary" icon={<PlusOutlined />} onClick={onNewConversation}>
            新建
          </Button>
        </div>

        <div className="cf-chatPage__sidebarSearch">
          <Input placeholder="搜索（暂未实现）" disabled size="small" />
        </div>

        <div className="cf-chatPage__sidebarList">
          {conversations.length === 0 ? (
            <div className="cf-chatPage__sidebarEmpty">
              <Empty description="暂无对话" image={Empty.PRESENTED_IMAGE_SIMPLE} />
              <Button type="primary" onClick={onNewConversation} icon={<PlusOutlined />}>
                创建第一个对话
              </Button>
            </div>
          ) : (
            <List
              size="small"
              dataSource={[...conversations].sort((a, b) => b.updatedAt - a.updatedAt)}
              renderItem={(conv) => {
                const isActive = conv.id === activeConversationId;
                return (
                  <List.Item
                    className={isActive ? 'cf-convItem cf-convItem--active' : 'cf-convItem'}
                    onClick={() => switchConversation(conv.id)}
                    actions={[
                      <Popconfirm
                        key="delete"
                        title="删除该对话？"
                        okText="删除"
                        cancelText="取消"
                        onConfirm={(e) => {
                          e?.stopPropagation();
                          onDeleteConversation(conv.id);
                        }}
                        onCancel={(e) => e?.stopPropagation()}
                      >
                        <Button
                          size="small"
                          type="text"
                          danger
                          icon={<DeleteOutlined />}
                          onClick={(e) => e.stopPropagation()}
                        />
                      </Popconfirm>,
                    ]}
                  >
                    <div className="cf-convItem__content">
                      <div className="cf-convItem__title">{conv.title || '未命名对话'}</div>
                      <div className="cf-convItem__meta">
                        <Text type="secondary" ellipsis>
                          {conv.messages.length} 条消息
                        </Text>
                      </div>
                    </div>
                  </List.Item>
                );
              }}
            />
          )}
        </div>
      </aside>

      <section className="cf-chatPage__main">
        <header className="cf-chatPage__mainHeader">
          <div className="cf-chatPage__title">
            <Text strong>{activeConversation?.title ?? '未选择对话'}</Text>
            {isLoading ? <Text type="secondary">（响应中…）</Text> : null}
          </div>
          {error ? (
            <div className="cf-chatPage__error">
              <Text type="danger">{error}</Text>
              <Button size="small" type="link" onClick={() => setError(null)}>
                清除
              </Button>
            </div>
          ) : null}
        </header>

        <div className="cf-chatPage__messages">
          {messages.length === 0 && !streamingMessage ? (
            <div className="cf-chatPage__emptyMain">
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="开始一个对话：在下方输入消息并发送"
              />
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

