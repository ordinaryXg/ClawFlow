import { FC, useEffect, useMemo, useState } from 'react';
import { DeleteOutlined, FolderOutlined, SettingOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useChatStore } from '../store/modules/chatStore';
import { useWorkspaceStore } from '../store/modules/workspaceStore';
import { useWorkspaceHubStore, type WorkspaceHubBranch } from '../store/modules/workspaceHubStore';
import { useTodoTriggerStore } from '../store/modules/todoTriggerStore';
import { useSubAgentStore } from '../store/modules/subAgentStore';
import { useWorkspaceSkillsStore } from '../store/modules/workspaceSkillsStore';
import { workspaceFolderLabel, workspacePathsLikelyEqual } from '../utils/workspace-path';
import WorkspaceNewToolsModal from './workspace/WorkspaceNewToolsModal';
import type { WorkspaceToolSelection } from '../shared/workspace-tools';
import { countTodoTriggersForWorkspaceHub } from '../shared/todo-triggers';

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
  const workspaceRecent = useWorkspaceStore((s) => s.recent);
  const pickWorkspacePath = useWorkspaceStore((s) => s.pickWorkspacePath);
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
  const [defaultWorkspacePath, setDefaultWorkspacePath] = useState<string | null>(null);
  const [toolModal, setToolModal] = useState<{
    open: boolean;
    path: string | null;
    mode: 'create' | 'edit';
  }>({ open: false, path: null, mode: 'create' });

  useEffect(() => {
    void fetchConversations();
  }, [fetchConversations, activeWorkspacePath]);

  const loadTodoTriggers = useTodoTriggerStore((s) => s.load);
  useEffect(() => {
    void loadTodoTriggers();
  }, [loadTodoTriggers, activeWorkspacePath]);

  const loadSubAgents = useSubAgentStore((s) => s.load);
  useEffect(() => {
    void loadSubAgents();
  }, [loadSubAgents, activeWorkspacePath]);

  const loadWorkspaceSkills = useWorkspaceSkillsStore((s) => s.load);
  useEffect(() => {
    void loadWorkspaceSkills();
  }, [loadWorkspaceSkills, activeWorkspacePath]);

  useEffect(() => {
    const off1 = window.electronAPI?.onTodoTriggersUpdated?.((p) => {
      if (activeWorkspacePath && workspacePathsLikelyEqual(p.workspaceRoot, activeWorkspacePath)) void loadTodoTriggers();
    });
    const off2 = window.electronAPI?.onSubAgentsUpdated?.((p) => {
      if (activeWorkspacePath && workspacePathsLikelyEqual(p.workspaceRoot, activeWorkspacePath)) void loadSubAgents();
    });
    return () => {
      off1?.();
      off2?.();
    };
  }, [activeWorkspacePath, loadTodoTriggers, loadSubAgents]);

  useEffect(() => {
    void window.electronAPI?.workspaceGetDefaultPath?.().then((p) => {
      if (typeof p === 'string' && p.trim()) setDefaultWorkspacePath(p.trim());
    });
  }, []);

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
  const subAgentsHubCount = useSubAgentStore((s) => s.slots.length);
  const skillsHubCount = useWorkspaceSkillsStore((s) => s.list.length);
  /** 知识库条目：能力接入前占位为 0 */
  const kbHubCount = 0;

  const workspaceRows = useMemo(() => {
    const r = [...(workspaceRecent ?? [])];
    const act = activeWorkspacePath;
    if (act && !r.includes(act)) {
      r.unshift(act);
    }
    return r;
  }, [workspaceRecent, activeWorkspacePath]);

  const onNewWorkspace = async () => {
    const picked = await pickWorkspacePath();
    if (!picked) return;
    setToolModal({ open: true, path: picked, mode: 'create' });
  };

  const onConfirmWorkspaceToolsModal = async (tools: WorkspaceToolSelection) => {
    const { path: p, mode } = toolModal;
    setToolModal({ open: false, path: null, mode: 'create' });
    if (!p) return;
    if (mode === 'create') {
      await commitNewWorkspace(p, tools);
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
    const isDefault =
      defaultWorkspacePath != null && workspacePathsLikelyEqual(folderPath, defaultWorkspacePath);
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
                    const showNest = isActiveWs && wsHubExpanded;

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
                          <div className="cf-sideTree__wsRowActions">
                            <button
                              type="button"
                              className="cf-sideTree__wsRowAct cf-sideTree__wsRowAct--tools"
                              title={t('chat.workspaceToolSettings')}
                              aria-label={t('chat.workspaceToolSettings')}
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setToolModal({ open: true, path: p, mode: 'edit' });
                              }}
                            >
                              <SettingOutlined />
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
                                  branchForActiveWs === 'subagents'
                                    ? 'cf-sideTree__hubRow cf-sideTree__hubRow--active'
                                    : 'cf-sideTree__hubRow'
                                }
                              >
                                <button
                                  type="button"
                                  className="cf-sideTree__hubMain cf-sideTree__hubMain--inlineCount"
                                  onClick={() => selectHubBranch(p, 'subagents')}
                                  title={t('chat.workspaceHub.hubCountSubAgents', {
                                    count: subAgentsHubCount,
                                  })}
                                >
                                  <span className="cf-sideTree__typeIcon cf-sideTree__typeIcon--hub" aria-hidden />
                                  <span className="cf-sideTree__hubMainLabel">
                                    {t('chat.workspaceHub.branchSubAgents')}
                                  </span>
                                  <span className="cf-sideTree__hubTrailingCount cf-sub">
                                    {t('chat.workspaceHub.hubCountSubAgents', { count: subAgentsHubCount })}
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

      <WorkspaceNewToolsModal
        open={toolModal.open}
        folderPath={toolModal.path}
        mode={toolModal.mode}
        onCancel={() => setToolModal({ open: false, path: null, mode: 'create' })}
        onConfirm={(tools) => void onConfirmWorkspaceToolsModal(tools)}
      />
    </aside>
  );
};

export default WorkspaceSidebar;
