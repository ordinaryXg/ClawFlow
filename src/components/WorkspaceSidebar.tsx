import { FC, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useChatStore } from '../store/modules/chatStore';
import { useWorkspaceStore } from '../store/modules/workspaceStore';

const WorkspaceSidebar: FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const {
    conversations,
    activeConversationId,
    fetchConversations,
    switchConversation,
    deleteConversation,
  } = useChatStore();

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

  const workspaceLabel =
    (workspaceMeta?.name && String(workspaceMeta.name).trim()) ||
    (activeWorkspacePath ? String(activeWorkspacePath).replace(/[/\\]+$/, '').split(/[/\\]/).pop() || '' : '') ||
    t('workspace.default');

  const sortedConversations = useMemo(
    () => [...conversations].sort((a, b) => b.updatedAt - a.updatedAt),
    [conversations]
  );

  const onNewWorkspace = async () => {
    await pickWorkspaceFolder();
    await refreshWorkspace();
  };

  const onDeleteConversation = (id: string) => {
    deleteConversation(id);
    (window as any).__cf_toast?.success?.(t('chat.deletedTitle'), t('chat.deletedBody'));
  };

  return (
    <aside className="cf-shell__sidebar">
      <div className="cf-shell__sidebarHeader">
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <b style={{ fontSize: 12 }}>{t('chat.sessions')}</b>
          <span className="cf-sub">{t('chat.sessionsSub')}</span>
        </div>
        <button className="cf-btn cf-btnPrimary cf-btnSmall" onClick={() => void onNewWorkspace()}>
          {t('chat.newWorkspace')}
        </button>
      </div>

      <div className="cf-shell__sidebarList">
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
                  {sortedConversations.length === 0 ? (
                    <div className="cf-shell__sidebarEmpty">
                      <div className="cf-card" style={{ width: '100%' }}>
                        <h3 style={{ marginBottom: 6 }}>{t('chat.noConversations')}</h3>
                        <div className="cf-sub">{t('chat.noConversationsSub')}</div>
                        <div style={{ height: 12 }} />
                        <div className="cf-sub">{t('chat.createFirstHint')}</div>
                      </div>
                    </div>
                  ) : (
                    <div className="cf-convList">
                      {sortedConversations.map((conv) => {
                        const isActive = conv.id === activeConversationId;
                        return (
                          <div
                            key={conv.id}
                            className={isActive ? 'cf-convItem cf-convItem--active' : 'cf-convItem'}
                            role="button"
                            tabIndex={0}
                            onClick={() => {
                              switchConversation(conv.id);
                              navigate('/chat');
                            }}
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
  );
};

export default WorkspaceSidebar;
