import { FC, useEffect, useMemo, useState } from 'react';
import { CommentOutlined, DeleteOutlined, FolderOutlined, PlusOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useChatStore } from '../store/modules/chatStore';
import { useWorkspaceStore } from '../store/modules/workspaceStore';

function folderLabel(fullPath: string): string {
  return String(fullPath)
    .replace(/[/\\]+$/, '')
    .split(/[/\\]/)
    .pop() || fullPath;
}

function pathsLikelyEqual(a: string, b: string): boolean {
  const norm = (s: string) =>
    String(s)
      .trim()
      .replace(/[/\\]+$/, '')
      .replace(/\\/g, '/')
      .toLowerCase();
  return norm(a) === norm(b);
}

type Props = {
  sidebarWidthPx: number;
  /** 窄屏无拖动条时，在侧栏右侧画分隔线 */
  trailingBorder?: boolean;
};

const WorkspaceSidebar: FC<Props> = ({ sidebarWidthPx, trailingBorder }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const {
    conversations,
    activeConversationId,
    fetchConversations,
    switchConversation,
    deleteConversation,
    createConversation,
  } = useChatStore();

  const activeWorkspacePath = useWorkspaceStore((s) => s.activePath);
  const workspaceMeta = useWorkspaceStore((s) => s.meta);
  const workspaceRecent = useWorkspaceStore((s) => s.recent);
  const pickWorkspaceFolder = useWorkspaceStore((s) => s.pickFolder);
  const setWorkspace = useWorkspaceStore((s) => s.setWorkspace);
  const refreshWorkspace = useWorkspaceStore((s) => s.refresh);
  const removeWorkspace = useWorkspaceStore((s) => s.removeWorkspace);
  const workspaceLoading = useWorkspaceStore((s) => s.loading);

  const [workspacesExpanded, setWorkspacesExpanded] = useState(true);
  const [convBranchOpen, setConvBranchOpen] = useState(true);
  const [defaultWorkspacePath, setDefaultWorkspacePath] = useState<string | null>(null);

  useEffect(() => {
    void fetchConversations();
  }, [fetchConversations, activeWorkspacePath]);

  useEffect(() => {
    void window.electronAPI?.workspaceGetDefaultPath?.().then((p) => {
      if (typeof p === 'string' && p.trim()) setDefaultWorkspacePath(p.trim());
    });
  }, []);

  useEffect(() => {
    setConvBranchOpen(true);
  }, [activeWorkspacePath]);

  const workspaceLabel =
    (workspaceMeta?.name && String(workspaceMeta.name).trim()) ||
    (activeWorkspacePath ? String(activeWorkspacePath).replace(/[/\\]+$/, '').split(/[/\\]/).pop() || '' : '') ||
    t('workspace.default');

  const sortedConversations = useMemo(
    () => [...conversations].sort((a, b) => b.updatedAt - a.updatedAt),
    [conversations]
  );

  const workspaceRows = useMemo(() => {
    const r = [...(workspaceRecent ?? [])];
    const act = activeWorkspacePath;
    if (act && !r.includes(act)) {
      r.unshift(act);
    }
    return r;
  }, [workspaceRecent, activeWorkspacePath]);

  const onNewWorkspace = async () => {
    await pickWorkspaceFolder();
    await refreshWorkspace();
  };

  const onDeleteConversation = (id: string) => {
    deleteConversation(id);
    (window as any).__cf_toast?.success?.(t('chat.deletedTitle'), t('chat.deletedBody'));
  };

  const onNewSessionInWorkspace = async (folderPath: string) => {
    await setWorkspace(folderPath);
    await createConversation();
    navigate('/chat');
  };

  const onRemoveWorkspaceRow = async (folderPath: string) => {
    const name = folderLabel(folderPath);
    const isDefault =
      defaultWorkspacePath != null && pathsLikelyEqual(folderPath, defaultWorkspacePath);
    const msg = isDefault
      ? t('chat.confirmRemoveWorkspaceDefault', { name })
      : t('chat.confirmRemoveWorkspaceDestroy', { name });
    if (!window.confirm(msg)) return;
    const res = await removeWorkspace(folderPath);
    if (!res.ok) {
      (window as unknown as { __cf_toast?: { error?: (a: string, b: string) => void } }).__cf_toast?.error?.(
        t('chat.removedWorkspaceTitle'),
        res.error
      );
      return;
    }
    (window as unknown as { __cf_toast?: { success?: (a: string, b: string) => void } }).__cf_toast?.success?.(
      t('chat.removedWorkspaceTitle'),
      res.deletedFromDisk ? t('chat.removedWorkspaceDeletedDisk') : t('chat.removedWorkspaceKeptDisk')
    );
    void fetchConversations();
  };

  return (
    <aside
      className={trailingBorder ? 'cf-shell__sidebar cf-shell__sidebar--trailingBorder' : 'cf-shell__sidebar'}
      style={{ width: sidebarWidthPx, flexShrink: 0 }}
    >
      <div className="cf-shell__sidebarList">
        <div className="cf-wsPanel">
          <div className="cf-wsPanel__head">
            <button
              type="button"
              className="cf-wsPanel__toggle"
              onClick={() => setWorkspacesExpanded((v) => !v)}
              aria-expanded={workspacesExpanded}
            >
              <span className="cf-wsPanel__toggleMain">
                <FolderOutlined className="cf-wsPanel__headIcon" aria-hidden />
                <span className="cf-wsPanel__title">{t('chat.workspacePanelTitle')}</span>
                <span className="cf-wsPanel__current cf-sub" title={activeWorkspacePath ?? ''}>
                  {workspaceLabel}
                </span>
              </span>
              <span className="cf-wsPanel__chev" aria-hidden>
                {workspacesExpanded ? '▾' : '▸'}
              </span>
            </button>
            <button type="button" className="cf-btn cf-btnPrimary cf-btnSmall" onClick={() => void onNewWorkspace()}>
              {t('chat.newWorkspace')}
            </button>
          </div>

          {workspacesExpanded ? (
            <div className="cf-wsPanel__body cf-sideTree">
              {workspaceLoading ? (
                <div className="cf-sideTree__loading">
                  <span className="cf-loading__spinner" />
                  <span className="cf-sub">{t('chat.switchingWorkspace')}</span>
                </div>
              ) : null}

              {workspaceRows.length === 0 ? (
                <div className="cf-sideTree__empty cf-sub">{t('chat.noWorkspaceInTree')}</div>
              ) : (
                <ul className="cf-sideTree__rootList" role="tree">
                  {workspaceRows.map((p) => {
                    const isActiveWs = Boolean(activeWorkspacePath && p === activeWorkspacePath);
                    const showNest = isActiveWs && convBranchOpen;

                    return (
                      <li key={p} className="cf-sideTree__wsLi" role="none">
                        <div
                          className={
                            isActiveWs
                              ? 'cf-sideTree__wsRow cf-sideTree__wsRow--active'
                              : 'cf-sideTree__wsRow'
                          }
                          role={isActiveWs ? 'treeitem' : 'none'}
                          aria-expanded={isActiveWs ? convBranchOpen : undefined}
                        >
                          <span className="cf-sideTree__typeIcon" aria-hidden title={t('workspace.title')}>
                            <FolderOutlined />
                          </span>
                          <button
                            type="button"
                            className={
                              isActiveWs
                                ? 'cf-sideTree__wsName cf-sideTree__wsName--active'
                                : 'cf-sideTree__wsName'
                            }
                            onClick={() => void setWorkspace(p)}
                            title={p}
                          >
                            {folderLabel(p)}
                          </button>
                          <div className="cf-sideTree__wsRowActions">
                            <button
                              type="button"
                              className="cf-sideTree__wsRowAct cf-sideTree__wsRowAct--new"
                              title={t('chat.newSession')}
                              aria-label={t('chat.newSession')}
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                void onNewSessionInWorkspace(p);
                              }}
                            >
                              <PlusOutlined />
                            </button>
                            <button
                              type="button"
                              className="cf-sideTree__wsRowAct cf-sideTree__wsRowAct--del"
                              title={t('chat.removeWorkspace')}
                              aria-label={t('chat.removeWorkspace')}
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                void onRemoveWorkspaceRow(p);
                              }}
                            >
                              <DeleteOutlined />
                            </button>
                          </div>
                          {isActiveWs ? (
                            <button
                              type="button"
                              className="cf-sideTree__chevBtn"
                              onClick={(e) => {
                                e.stopPropagation();
                                setConvBranchOpen((v) => !v);
                              }}
                              aria-label={convBranchOpen ? t('chat.collapseSessions') : t('chat.expandSessions')}
                            >
                              {convBranchOpen ? '▾' : '▸'}
                            </button>
                          ) : (
                            <span className="cf-sideTree__chevSpacer" aria-hidden />
                          )}
                        </div>

                        {showNest ? (
                          <ul className="cf-sideTree__nest" role="group" aria-label={t('chat.sessions')}>
                            {sortedConversations.length === 0 ? (
                              <li className="cf-sideTree__nestHint">
                                <div className="cf-sideTree__nestHintText cf-sub">{t('chat.noConversationsSub')}</div>
                              </li>
                            ) : (
                              sortedConversations.map((conv) => {
                                const isActiveConv = conv.id === activeConversationId;

                                return (
                                  <li key={conv.id} className="cf-sideTree__convLi" role="none">
                                    <div
                                      className={
                                        isActiveConv
                                          ? 'cf-sideTree__convRow cf-convItem cf-convItem--active'
                                          : 'cf-sideTree__convRow cf-convItem'
                                      }
                                      role="button"
                                      tabIndex={0}
                                      onClick={() => {
                                        switchConversation(conv.id);
                                        navigate('/chat');
                                      }}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter' || e.key === ' ') {
                                          e.preventDefault();
                                          switchConversation(conv.id);
                                          navigate('/chat');
                                        }
                                      }}
                                    >
                                      <span className="cf-sideTree__typeIcon cf-sideTree__typeIcon--conv" aria-hidden>
                                        <CommentOutlined />
                                      </span>
                                      <div className="cf-convItem__content">
                                        <div className="cf-convItem__title">{conv.title || t('chat.unnamed')}</div>
                                        <div className="cf-convItem__meta">
                                          {t('chat.msgCount', { count: conv.messages.length })}
                                        </div>
                                      </div>
                                      <button
                                        type="button"
                                        className="cf-btn cf-btnGhost cf-convItem__deleteBtn"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          const ok = window.confirm(t('chat.confirmDelete'));
                                          if (ok) onDeleteConversation(conv.id);
                                        }}
                                        title={t('chat.deleteSession')}
                                        aria-label={t('chat.deleteSession')}
                                      >
                                        <DeleteOutlined />
                                      </button>
                                    </div>
                                  </li>
                                );
                              })
                            )}
                          </ul>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </aside>
  );
};

export default WorkspaceSidebar;
