import { FC, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CloudDownloadOutlined,
  CloudUploadOutlined,
  DeleteOutlined,
  EllipsisOutlined,
  FolderOutlined,
  ReloadOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useChatStore } from '../store/modules/chatStore';
import { useWorkspaceStore } from '../store/modules/workspaceStore';
import { useWorkspaceHubStore, type WorkspaceHubBranch } from '../store/modules/workspaceHubStore';
import { useTodoTriggerStore } from '../store/modules/todoTriggerStore';
import { useWorkspaceSkillsStore } from '../store/modules/workspaceSkillsStore';
import { workspaceFolderLabel, workspacePathsLikelyEqual } from '../utils/workspace-path';
import WorkspaceNewToolsModal from './workspace/WorkspaceNewToolsModal';
import WorkspaceCreateModal from './workspace/WorkspaceCreateModal';
import type { WorkspaceToolSelection } from '../shared/workspace-tools';
import { countTodoTriggersForWorkspaceHub } from '../shared/todo-triggers';
import { skillsForHermesDiscoveryUi } from '../shared/workspace-skills-discovery-filter';
import { normalizeWorkspacePathForCompare } from '../shared/workspace-path-compare';

type Props = {
  sidebarWidthPx: number;
  /** 窄屏无拖动条时，在侧栏右侧画分隔线 */
  trailingBorder?: boolean;
};

const WorkspaceSidebar: FC<Props> = ({ sidebarWidthPx, trailingBorder }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const { conversations, fetchConversations, switchConversation } = useChatStore();

  const activeWorkspacePath = useWorkspaceStore((s) => s.activePath);
  const workspaceMeta = useWorkspaceStore((s) => s.meta);
  const recentEntries = useWorkspaceStore((s) => s.recentEntries);
  const commitNewWorkspace = useWorkspaceStore((s) => s.commitNewWorkspace);
  const setWorkspace = useWorkspaceStore((s) => s.setWorkspace);
  const refreshWorkspace = useWorkspaceStore((s) => s.refresh);
  const removeWorkspace = useWorkspaceStore((s) => s.removeWorkspace);
  const workspaceLoading = useWorkspaceStore((s) => s.loading);

  const setHubBranch = useWorkspaceHubStore((s) => s.setHubBranch);
  const hubBranchPathKey = activeWorkspacePath ?? '';
  const branchForActiveWs = useWorkspaceHubStore((s) =>
    hubBranchPathKey ? (s.branchByPath[hubBranchPathKey] ?? 'sessions') : 'sessions'
  );

  const [workspacesExpanded, setWorkspacesExpanded] = useState(true);
  const [wsHubExpanded, setWsHubExpanded] = useState(true);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [gitBusyPath, setGitBusyPath] = useState<string | null>(null);
  const [wsActionMenuFor, setWsActionMenuFor] = useState<string | null>(null);
  const [resetBusyPath, setResetBusyPath] = useState<string | null>(null);
  const [toolModal, setToolModal] = useState<{
    open: boolean;
    path: string | null;
    mode: 'create' | 'edit';
    gitRemoteUrl?: string | null;
  }>({ open: false, path: null, mode: 'create' });

  useEffect(() => {
    void fetchConversations();
  }, [fetchConversations, activeWorkspacePath]);

  const loadTodoTriggers = useTodoTriggerStore((s) => s.load);
  useEffect(() => {
    void loadTodoTriggers();
  }, [loadTodoTriggers, activeWorkspacePath]);

  const loadWorkspaceSkills = useWorkspaceSkillsStore((s) => s.load);
  useEffect(() => {
    void loadWorkspaceSkills();
  }, [loadWorkspaceSkills, activeWorkspacePath]);

  useEffect(() => {
    const off1 = window.electronAPI?.onTodoTriggersUpdated?.((p) => {
      if (activeWorkspacePath && workspacePathsLikelyEqual(p.workspaceRoot, activeWorkspacePath)) void loadTodoTriggers();
    });
    return () => {
      off1?.();
    };
  }, [activeWorkspacePath, loadTodoTriggers]);

  useEffect(() => {
    setWsHubExpanded(true);
  }, [activeWorkspacePath]);

  const selectHubBranch = (folderPath: string, branch: WorkspaceHubBranch) => {
    setHubBranch(folderPath, branch);
    navigate('/chat');
  };

  const workspaceLabel =
    (workspaceMeta?.name && String(workspaceMeta.name).trim()) ||
    (activeWorkspacePath ? String(activeWorkspacePath).replace(/[/\\]+$/, '').split(/[/\\]/).pop() || '' : '') ||
    t('workspace.default');

  const sortedConversations = useMemo(
    () => [...conversations].sort((a, b) => b.updatedAt - a.updatedAt),
    [conversations]
  );

  /** 侧栏「会话」摘要：当前主会话消息数 */
  const sessionsHubMsgCount = useMemo(() => sortedConversations[0]?.messages.length ?? 0, [sortedConversations]);

  const todoTriggersList = useTodoTriggerStore((s) => s.triggers);
  const todosHubCount = useMemo(
    () => countTodoTriggersForWorkspaceHub(todoTriggersList),
    [todoTriggersList]
  );
  const skillsListRaw = useWorkspaceSkillsStore((s) => s.list);
  const skillsHubCount = useMemo(() => skillsForHermesDiscoveryUi(skillsListRaw).length, [skillsListRaw]);
  /** 知识库条目：能力接入前占位为 0 */
  const kbHubCount = 0;

  const workspaceRows = useMemo(() => {
    const r = recentEntries.map((e) => e.path);
    const act = activeWorkspacePath;
    if (act && !r.some((x) => workspacePathsLikelyEqual(x, act))) {
      r.unshift(act);
    }
    return r;
  }, [recentEntries, activeWorkspacePath]);
  const workspaceRowsRef = useRef(workspaceRows);
  workspaceRowsRef.current = workspaceRows;

  const [unreadByNorm, setUnreadByNorm] = useState<Record<string, { total: number }>>({});

  const refreshWorkspaceUnreadSummaries = useCallback(async (paths: string[]) => {
    const api = window.electronAPI;
    if (!api?.workspaceListUnreadSummaries || paths.length === 0) {
      setUnreadByNorm({});
      return;
    }
    try {
      const { summaries } = await api.workspaceListUnreadSummaries({ paths });
      const next: Record<string, { total: number }> = {};
      for (const s of summaries) {
        next[normalizeWorkspacePathForCompare(s.workspaceRoot)] = { total: s.total };
      }
      setUnreadByNorm(next);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void refreshWorkspaceUnreadSummaries(workspaceRows);
  }, [workspaceRows, activeWorkspacePath, refreshWorkspaceUnreadSummaries]);

  useEffect(() => {
    const offDirty = window.electronAPI?.onChatConversationsDirty?.((p) => {
      const wr = typeof p?.workspaceRoot === 'string' ? p.workspaceRoot.trim() : '';
      const rows = workspaceRowsRef.current;
      const paths =
        wr && !rows.some((x) => workspacePathsLikelyEqual(x, wr)) ? [...rows, wr] : rows.length ? rows : wr ? [wr] : [];
      void refreshWorkspaceUnreadSummaries(paths);
    });
    return () => {
      offDirty?.();
    };
  }, [refreshWorkspaceUnreadSummaries]);

  const gitRemoteForRow = useMemo(() => {
    const m = new Map<string, string | null>();
    for (const e of recentEntries) {
      m.set(e.path, e.gitRemoteUrl);
    }
    return m;
  }, [recentEntries]);

  const resolveGitRemoteUrl = (folderPath: string): string | null => {
    for (const [k, v] of gitRemoteForRow) {
      if (workspacePathsLikelyEqual(k, folderPath)) return v;
    }
    if (activeWorkspacePath && workspacePathsLikelyEqual(folderPath, activeWorkspacePath)) {
      const u = workspaceMeta?.gitRemoteUrl?.trim();
      return u || null;
    }
    return null;
  };

  const onNewWorkspace = () => {
    setCreateModalOpen(true);
  };

  const onGitPullRow = async (folderPath: string) => {
    setGitBusyPath(folderPath);
    try {
      const res = await window.electronAPI?.workspaceGitPull?.(folderPath);
      const toast = (window as unknown as { __cf_toast?: { success?: (a: string, b?: string) => void; error?: (a: string, b?: string) => void } }).__cf_toast;
      if (res && typeof res === 'object' && 'ok' in res && res.ok === true) {
        const out = 'stdout' in res ? String((res as { stdout?: string }).stdout ?? '').trim() : '';
        toast?.success?.(t('workspace.gitPullOk'), out ? out.slice(0, 400) : undefined);
        await refreshWorkspace();
        return;
      }
      const err = res && typeof res === 'object' && 'error' in res ? String((res as { error?: string }).error ?? '') : 'failed';
      toast?.error?.(t('workspace.gitOpFailed'), err);
    } finally {
      setGitBusyPath(null);
    }
  };

  const onGitPushRow = async (folderPath: string) => {
    setGitBusyPath(folderPath);
    try {
      const res = await window.electronAPI?.workspaceGitPush?.(folderPath);
      const toast = (window as unknown as { __cf_toast?: { success?: (a: string, b?: string) => void; error?: (a: string, b?: string) => void } }).__cf_toast;
      if (res && typeof res === 'object' && 'ok' in res && res.ok === true) {
        const out = 'stdout' in res ? String((res as { stdout?: string }).stdout ?? '').trim() : '';
        toast?.success?.(t('workspace.gitPushOk'), out ? out.slice(0, 400) : undefined);
        await refreshWorkspace();
        return;
      }
      const err = res && typeof res === 'object' && 'error' in res ? String((res as { error?: string }).error ?? '') : 'failed';
      toast?.error?.(t('workspace.gitOpFailed'), err);
    } finally {
      setGitBusyPath(null);
    }
  };

  const onResetWorkspaceCacheRow = async (folderPath: string) => {
    const name = workspaceFolderLabel(folderPath);
    const msg = t('workspace.resetCacheConfirm', { name });
    if (!window.confirm(msg)) return;
    setResetBusyPath(folderPath);
    try {
      const res = await window.electronAPI?.workspaceResetCache?.(folderPath);
      const toast = (window as unknown as {
        __cf_toast?: { success?: (a: string, b?: string) => void; error?: (a: string, b?: string) => void };
      }).__cf_toast;
      if (res && typeof res === 'object' && 'ok' in res && res.ok === true) {
        toast?.success?.(t('workspace.resetCacheOkTitle'), t('workspace.resetCacheOkBody'));
        await refreshWorkspace();
        await fetchConversations();
        navigate('/chat');
        return;
      }
      const err = res && typeof res === 'object' && 'error' in res ? String((res as { error?: string }).error ?? '') : 'failed';
      toast?.error?.(t('workspace.resetCacheFailed'), err);
    } finally {
      setResetBusyPath(null);
      setWsActionMenuFor(null);
    }
  };

  const onConfirmWorkspaceToolsModal = async (tools: WorkspaceToolSelection) => {
    const { path: p, mode, gitRemoteUrl } = toolModal;
    setToolModal({ open: false, path: null, mode: 'create', gitRemoteUrl: undefined });
    if (!p) return;
    if (mode === 'create') {
      await commitNewWorkspace(p, tools, gitRemoteUrl?.trim() ? { gitRemoteUrl: gitRemoteUrl.trim() } : undefined);
      await fetchConversations();
      navigate('/chat');
      return;
    }
    const res = await window.electronAPI?.workspaceSetToolSelection?.(p, tools);
    if (res?.ok) {
      (window as unknown as { __cf_toast?: { success?: (a: string, b?: string) => void } }).__cf_toast?.success?.(
        t('workspace.toolsSavedTitle'),
        t('workspace.toolsSavedBody')
      );
    } else {
      (window as unknown as { __cf_toast?: { error?: (a: string, b?: string) => void } }).__cf_toast?.error?.(
        t('workspace.toolsSaveFailed'),
        res && 'error' in res ? res.error : undefined
      );
    }
  };

  const onRemoveWorkspaceRow = async (folderPath: string) => {
    const name = workspaceFolderLabel(folderPath);
    const msg = t('chat.confirmRemoveWorkspaceDestroy', { name });
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
                    const isActiveWs = Boolean(activeWorkspacePath && workspacePathsLikelyEqual(p, activeWorkspacePath));
                    const showNest = isActiveWs && wsHubExpanded;
                    const gitRemote = resolveGitRemoteUrl(p);
                    const gitBusyHere = gitBusyPath != null && workspacePathsLikelyEqual(gitBusyPath, p);
                    const resetBusyHere = resetBusyPath != null && workspacePathsLikelyEqual(resetBusyPath, p);
                    const menuOpen = wsActionMenuFor != null && workspacePathsLikelyEqual(wsActionMenuFor, p);
                    const normKey = normalizeWorkspacePathForCompare(p);
                    const rowUnreadParts = unreadByNorm[normKey];
                    const rowUnread = rowUnreadParts?.total ?? 0;
                    const unreadBadgeTitle =
                      rowUnread > 0
                        ? `${t('workspace.unreadBadgeTitle')} (${rowUnread})`
                        : t('workspace.unreadBadgeTitle');

                    return (
                      <li key={p} className="cf-sideTree__wsLi" role="none">
                        <div
                          className={
                            isActiveWs
                              ? 'cf-sideTree__wsRow cf-sideTree__wsRow--active'
                              : 'cf-sideTree__wsRow'
                          }
                          role={isActiveWs ? 'treeitem' : 'none'}
                          aria-expanded={isActiveWs ? wsHubExpanded : undefined}
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
                            {workspaceFolderLabel(p)}
                          </button>
                          {rowUnread > 0 ? (
                            <span
                              className="cf-sideTree__wsUnreadBadge"
                              title={unreadBadgeTitle}
                              aria-label={t('workspace.unreadBadgeAria', { count: rowUnread })}
                            >
                              {rowUnread > 99 ? '99+' : rowUnread}
                            </span>
                          ) : null}
                          <div className="cf-sideTree__wsRowActions">
                            <button
                              type="button"
                              className="cf-sideTree__wsRowAct cf-sideTree__wsRowAct--more"
                              title={t('workspace.rowActionsMore')}
                              aria-label={t('workspace.rowActionsMore')}
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setWsActionMenuFor((prev) => (prev && workspacePathsLikelyEqual(prev, p) ? null : p));
                              }}
                            >
                              <EllipsisOutlined />
                            </button>

                            {menuOpen ? (
                              <div
                                className="cf-sideTree__wsActionPopover"
                                role="dialog"
                                aria-label={t('workspace.rowActionsMore')}
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                }}
                              >
                                {gitRemote ? (
                                  <>
                                    <button
                                      type="button"
                                      className="cf-sideTree__wsActionItem"
                                      disabled={gitBusyHere}
                                      onClick={() => void onGitPullRow(p)}
                                    >
                                      <CloudDownloadOutlined /> {t('workspace.gitPullTitle')}
                                    </button>
                                    <button
                                      type="button"
                                      className="cf-sideTree__wsActionItem"
                                      disabled={gitBusyHere}
                                      onClick={() => void onGitPushRow(p)}
                                    >
                                      <CloudUploadOutlined /> {t('workspace.gitPushTitle')}
                                    </button>
                                    <div className="cf-sideTree__wsActionSep" />
                                  </>
                                ) : null}

                                <button
                                  type="button"
                                  className="cf-sideTree__wsActionItem"
                                  onClick={() => {
                                    setWsActionMenuFor(null);
                                    setToolModal({ open: true, path: p, mode: 'edit', gitRemoteUrl: undefined });
                                  }}
                                >
                                  <SettingOutlined /> {t('chat.workspaceToolSettings')}
                                </button>

                                <button
                                  type="button"
                                  className="cf-sideTree__wsActionItem"
                                  disabled={resetBusyHere}
                                  onClick={() => void onResetWorkspaceCacheRow(p)}
                                >
                                  <ReloadOutlined /> {t('workspace.resetCacheTitle')}
                                </button>

                                <div className="cf-sideTree__wsActionSep" />

                                <button
                                  type="button"
                                  className="cf-sideTree__wsActionItem cf-sideTree__wsActionItem--danger"
                                  onClick={() => {
                                    setWsActionMenuFor(null);
                                    void onRemoveWorkspaceRow(p);
                                  }}
                                >
                                  <DeleteOutlined /> {t('chat.removeWorkspace')}
                                </button>
                              </div>
                            ) : null}
                          </div>
                          {isActiveWs ? (
                            <button
                              type="button"
                              className="cf-sideTree__chevBtn"
                              onClick={(e) => {
                                e.stopPropagation();
                                setWsHubExpanded((v) => !v);
                              }}
                              aria-label={
                                wsHubExpanded ? t('chat.collapseWorkspaceHub') : t('chat.expandWorkspaceHub')
                              }
                            >
                              {wsHubExpanded ? '▾' : '▸'}
                            </button>
                          ) : (
                            <span className="cf-sideTree__chevSpacer" aria-hidden />
                          )}
                        </div>

                        {showNest ? (
                          <ul className="cf-sideTree__hubNest" role="group" aria-label={t('workspace.title')}>
                            <li className="cf-sideTree__hubLi" role="none">
                              <div
                                className={
                                  branchForActiveWs === 'sessions'
                                    ? 'cf-sideTree__hubRow cf-sideTree__hubRow--active'
                                    : 'cf-sideTree__hubRow'
                                }
                              >
                                <button
                                  type="button"
                                  className="cf-sideTree__hubMain cf-sideTree__hubMain--inlineCount"
                                  onClick={() => {
                                    selectHubBranch(p, 'sessions');
                                    const top = sortedConversations[0];
                                    if (top) switchConversation(top.id);
                                  }}
                                  title={t('chat.msgCount', { count: sessionsHubMsgCount })}
                                >
                                  <span className="cf-sideTree__typeIcon cf-sideTree__typeIcon--hub" aria-hidden />
                                  <span className="cf-sideTree__hubMainLabel">{t('chat.sessions')}</span>
                                  <span className="cf-sideTree__hubTrailingCount cf-sub">
                                    {t('chat.msgCount', { count: sessionsHubMsgCount })}
                                  </span>
                                </button>
                                <span className="cf-sideTree__hubChevSpacer" aria-hidden />
                              </div>
                            </li>
                            <li className="cf-sideTree__hubLi" role="none">
                              <div
                                className={
                                  branchForActiveWs === 'todos'
                                    ? 'cf-sideTree__hubRow cf-sideTree__hubRow--active'
                                    : 'cf-sideTree__hubRow'
                                }
                              >
                                <button
                                  type="button"
                                  className="cf-sideTree__hubMain cf-sideTree__hubMain--inlineCount"
                                  onClick={() => selectHubBranch(p, 'todos')}
                                  title={t('chat.workspaceHub.hubCountTodos', { count: todosHubCount })}
                                >
                                  <span className="cf-sideTree__typeIcon cf-sideTree__typeIcon--hub" aria-hidden />
                                  <span className="cf-sideTree__hubMainLabel">
                                    {t('chat.workspaceHub.branchTodos')}
                                  </span>
                                  <span className="cf-sideTree__hubTrailingCount cf-sub">
                                    {t('chat.workspaceHub.hubCountTodos', { count: todosHubCount })}
                                  </span>
                                </button>
                                <span className="cf-sideTree__hubChevSpacer" aria-hidden />
                              </div>
                            </li>
                            
                            <li className="cf-sideTree__hubLi" role="none">
                              <div
                                className={
                                  branchForActiveWs === 'skills'
                                    ? 'cf-sideTree__hubRow cf-sideTree__hubRow--active'
                                    : 'cf-sideTree__hubRow'
                                }
                              >
                                <button
                                  type="button"
                                  className="cf-sideTree__hubMain cf-sideTree__hubMain--inlineCount"
                                  onClick={() => selectHubBranch(p, 'skills')}
                                  title={t('chat.workspaceHub.skillsBranchHint')}
                                >
                                  <span className="cf-sideTree__typeIcon cf-sideTree__typeIcon--hub" aria-hidden />
                                  <span className="cf-sideTree__hubMainLabel">
                                    {t('chat.workspaceHub.branchSkills')}
                                  </span>
                                  <span className="cf-sideTree__hubTrailingCount cf-sub">
                                    {t('chat.workspaceHub.hubCountSkills', { count: skillsHubCount })}
                                  </span>
                                </button>
                                <span className="cf-sideTree__hubChevSpacer" aria-hidden />
                              </div>
                            </li>
                            <li className="cf-sideTree__hubLi" role="none">
                              <div
                                className={
                                  branchForActiveWs === 'kb'
                                    ? 'cf-sideTree__hubRow cf-sideTree__hubRow--active'
                                    : 'cf-sideTree__hubRow'
                                }
                              >
                                <button
                                  type="button"
                                  className="cf-sideTree__hubMain cf-sideTree__hubMain--inlineCount"
                                  onClick={() => selectHubBranch(p, 'kb')}
                                  title={t('chat.workspaceHub.kbHint')}
                                >
                                  <span className="cf-sideTree__typeIcon cf-sideTree__typeIcon--hub" aria-hidden />
                                  <span className="cf-sideTree__hubMainLabel">
                                    {t('chat.workspaceHub.branchKb')}
                                  </span>
                                  <span className="cf-sideTree__hubTrailingCount cf-sub">
                                    {t('chat.workspaceHub.hubCountKb', { count: kbHubCount })}
                                  </span>
                                </button>
                                <span className="cf-sideTree__hubChevSpacer" aria-hidden />
                              </div>
                            </li>
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

      <WorkspaceCreateModal
        open={createModalOpen}
        onCancel={() => setCreateModalOpen(false)}
        onContinueToTools={(folderPath, opts) => {
          setCreateModalOpen(false);
          setToolModal({
            open: true,
            path: folderPath,
            mode: 'create',
            gitRemoteUrl: opts?.gitRemoteUrl ?? undefined,
          });
        }}
      />

      <WorkspaceNewToolsModal
        open={toolModal.open}
        folderPath={toolModal.path}
        mode={toolModal.mode}
        onCancel={() => setToolModal({ open: false, path: null, mode: 'create', gitRemoteUrl: undefined })}
        onConfirm={(tools) => void onConfirmWorkspaceToolsModal(tools)}
      />
    </aside>
  );
};

export default WorkspaceSidebar;
