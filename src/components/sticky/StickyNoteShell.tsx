import { FC, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { PlusOutlined, SettingOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { Outlet, useNavigate } from 'react-router-dom';
import { useChatStore } from '../../store/modules/chatStore';
import { useWorkspaceStore } from '../../store/modules/workspaceStore';
import { workspaceFolderLabel, workspacePathsLikelyEqual } from '../../utils/workspace-path';
import ViewModeFab from '../ViewModeFab';
import WorkspaceNewToolsModal from '../workspace/WorkspaceNewToolsModal';
import StickyFileStrip from './StickyFileStrip';
import type { WorkspaceToolSelection } from '../../shared/workspace-tools';
import './stickyNoteShell.css';

function pushToast(type: 'success' | 'error', title: string, message?: string): void {
  const api = (window as unknown as { __cf_toast?: { success: (t: string, m?: string) => void; error: (t: string, m?: string) => void } })
    .__cf_toast;
  if (!api) return;
  if (type === 'success') api.success(title, message);
  else api.error(title, message);
}

function hasFileDrag(e: React.DragEvent): boolean {
  return [...e.dataTransfer.types].includes('Files');
}

const STICKY_FILE_PANE_H_KEY = 'clawflow.stickyFilePaneHeightPx';
const DEFAULT_FILE_PANE_H = 176;
const MIN_FILE_PANE_H = 88;
const MIN_CHAT_SECTION_H = 200;
const SPLITTER_H = 6;

function loadFilePaneHeight(): number {
  try {
    const n = Number.parseInt(localStorage.getItem(STICKY_FILE_PANE_H_KEY) ?? '', 10);
    if (Number.isFinite(n)) return Math.max(MIN_FILE_PANE_H, n);
  } catch {
    /* ignore */
  }
  return DEFAULT_FILE_PANE_H;
}

/**
 * 便签式桌面布局：左侧工作区标签（独立滚动）、顶栏、中间上下分栏（文件区 / 对话区，可拖拽调节高度；仅对话消息区滚动）。
 */
const StickyNoteShell: FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const activeWorkspacePath = useWorkspaceStore((s) => s.activePath);
  const workspaceMeta = useWorkspaceStore((s) => s.meta);
  const workspaceRecent = useWorkspaceStore((s) => s.recent);
  const setWorkspace = useWorkspaceStore((s) => s.setWorkspace);
  const pickWorkspacePath = useWorkspaceStore((s) => s.pickWorkspacePath);
  const commitNewWorkspace = useWorkspaceStore((s) => s.commitNewWorkspace);

  const { fetchConversations } = useChatStore();

  const splitWrapRef = useRef<HTMLDivElement | null>(null);
  const [addDropOver, setAddDropOver] = useState(false);
  const [toolModal, setToolModal] = useState<{
    open: boolean;
    path: string | null;
    mode: 'create' | 'edit';
  }>({ open: false, path: null, mode: 'create' });
  const [filePaneHeightPx, setFilePaneHeightPx] = useState(loadFilePaneHeight);
  const filePaneHeightRef = useRef(filePaneHeightPx);
  filePaneHeightRef.current = filePaneHeightPx;
  const splitDragRef = useRef<{ startY: number; startH: number } | null>(null);

  const workspaceRows = useMemo(() => {
    const r = [...(workspaceRecent ?? [])];
    const act = activeWorkspacePath;
    if (act && !r.some((p) => workspacePathsLikelyEqual(p, act))) {
      r.unshift(act);
    }
    return r;
  }, [workspaceRecent, activeWorkspacePath]);

  const workspaceLabel =
    (workspaceMeta?.name && String(workspaceMeta.name).trim()) ||
    (activeWorkspacePath ? workspaceFolderLabel(activeWorkspacePath) : '') ||
    t('workspace.default');

  const clampFilePane = useCallback((h: number) => {
    const wrap = splitWrapRef.current;
    if (!wrap) return Math.max(MIN_FILE_PANE_H, h);
    const inner = wrap.getBoundingClientRect().height - SPLITTER_H;
    const maxFile = Math.max(MIN_FILE_PANE_H, inner - MIN_CHAT_SECTION_H);
    return Math.max(MIN_FILE_PANE_H, Math.min(maxFile, h));
  }, []);

  useLayoutEffect(() => {
    setFilePaneHeightPx((prev) => {
      const c = clampFilePane(prev);
      return c === prev ? prev : c;
    });
  }, [clampFilePane, activeWorkspacePath]);

  useEffect(() => {
    const onWinResize = () =>
      setFilePaneHeightPx((prev) => {
        const c = clampFilePane(prev);
        return c === prev ? prev : c;
      });
    window.addEventListener('resize', onWinResize);
    return () => window.removeEventListener('resize', onWinResize);
  }, [clampFilePane]);

  const onSplitPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    splitDragRef.current = { startY: e.clientY, startH: filePaneHeightPx };
    e.currentTarget.setPointerCapture(e.pointerId);
    e.currentTarget.classList.add('cf-stickyMain__splitter--active');
  };

  const onSplitPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const drag = splitDragRef.current;
    if (!drag) return;
    const dy = e.clientY - drag.startY;
    const next = clampFilePane(drag.startH + dy);
    filePaneHeightRef.current = next;
    setFilePaneHeightPx(next);
  };

  const endSplitDrag = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!splitDragRef.current) return;
    splitDragRef.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    e.currentTarget.classList.remove('cf-stickyMain__splitter--active');
    try {
      localStorage.setItem(STICKY_FILE_PANE_H_KEY, String(filePaneHeightRef.current));
    } catch {
      /* ignore */
    }
  };

  const onAddWorkspace = async () => {
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
      pushToast('success', t('sticky.workspaceDropAddOk'));
      return;
    }
    const res = await window.electronAPI?.workspaceSetToolSelection?.(p, tools);
    if (res?.ok) {
      pushToast('success', t('workspace.toolsSavedTitle'), t('workspace.toolsSavedBody'));
    } else {
      pushToast('error', t('workspace.toolsSaveFailed'), res && 'error' in res ? res.error : undefined);
    }
  };

  const onAddDragOver = (e: React.DragEvent) => {
    if (!hasFileDrag(e)) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
    setAddDropOver(true);
  };

  const onAddDragLeave = (e: React.DragEvent) => {
    if (!hasFileDrag(e)) return;
    const cur = e.currentTarget;
    const rel = e.relatedTarget;
    if (rel && cur instanceof Node && cur.contains(rel as Node)) return;
    setAddDropOver(false);
  };

  const onAddDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setAddDropOver(false);
    if (!hasFileDrag(e)) return;
    const api = window.electronAPI;
    if (!api?.getPathForFile || e.dataTransfer.files.length === 0) {
      pushToast('error', t('sticky.workspaceDropAddNoPath'));
      return;
    }
    let abs: string;
    try {
      abs = api.getPathForFile(e.dataTransfer.files[0]);
    } catch {
      pushToast('error', t('sticky.workspaceDropAddNoPath'));
      return;
    }
    const stat = await api.workspaceStatAbsolutePath?.(abs);
    if (!stat || stat.ok === false) {
      pushToast('error', t('sticky.workspaceDropAddFailed'));
      return;
    }
    if (!stat.isDirectory) {
      pushToast('error', t('sticky.workspaceDropAddNotFolder'));
      return;
    }
    setToolModal({ open: true, path: stat.path, mode: 'create' });
  };

  const onPickWorkspace = async (folderPath: string) => {
    await setWorkspace(folderPath);
    await fetchConversations();
    navigate('/chat');
  };

  return (
    <div className="cf-stickyShell">
      <nav className="cf-stickyRail" aria-label={t('sticky.workspaceRailAria')}>
        {workspaceRows.map((path) => {
          const active = activeWorkspacePath && workspacePathsLikelyEqual(path, activeWorkspacePath);
          return (
            <button
              key={path}
              type="button"
              className={`cf-stickyRail__tab${active ? ' cf-stickyRail__tab--active' : ''}`}
              onClick={() => void onPickWorkspace(path)}
              title={path}
            >
              <span className="cf-stickyRail__tabText">{workspaceFolderLabel(path)}</span>
            </button>
          );
        })}
        <button
          type="button"
          className={`cf-stickyRail__add${addDropOver ? ' cf-stickyRail__add--dropOver' : ''}`}
          onClick={() => void onAddWorkspace()}
          onDragOver={onAddDragOver}
          onDragLeave={onAddDragLeave}
          onDrop={(ev) => void onAddDrop(ev)}
          aria-label={t('sticky.addWorkspace')}
          title={t('sticky.addWorkspaceDropHint')}
        >
          <PlusOutlined />
        </button>
      </nav>

      <div className="cf-stickyMain">
        <header className="cf-stickyMain__bar">
          <div className="cf-stickyMain__titleWrap">
            <span className="cf-stickyMain__statusDot" aria-hidden />
            <span className="cf-stickyMain__title">{workspaceLabel}</span>
          </div>
          <div className="cf-stickyMain__barRight">
            <button
              type="button"
              className="cf-stickyMain__workspaceToolsBtn"
              title={
                activeWorkspacePath?.trim()
                  ? t('chat.workspaceToolSettings')
                  : t('sticky.workspaceToolsNeedWs')
              }
              aria-label={t('chat.workspaceToolSettings')}
              disabled={!activeWorkspacePath?.trim()}
              onClick={() => {
                const p = activeWorkspacePath?.trim();
                if (!p) return;
                setToolModal({ open: true, path: p, mode: 'edit' });
              }}
            >
              <SettingOutlined />
            </button>
            <span className="cf-stickyMain__sortPill" title={t('sticky.sortPlaceholder')}>
              {t('sticky.sortDefault')}
            </span>
            <ViewModeFab variant="stickyBar" />
          </div>
        </header>

        <div ref={splitWrapRef} className="cf-stickyMain__splitWrap">
          <div className="cf-stickyMain__filePane" style={{ height: filePaneHeightPx }}>
            <StickyFileStrip workspacePath={activeWorkspacePath} embedFill />
          </div>

          <button
            type="button"
            className="cf-stickyMain__splitter"
            aria-label={t('sticky.splitResize')}
            title={t('sticky.splitResizeHint')}
            onPointerDown={onSplitPointerDown}
            onPointerMove={onSplitPointerMove}
            onPointerUp={endSplitDrag}
            onPointerCancel={endSplitDrag}
          />

          <section className="cf-stickyMain__chatPane">
            <Outlet />
          </section>
        </div>
      </div>

      <WorkspaceNewToolsModal
        open={toolModal.open}
        folderPath={toolModal.path}
        mode={toolModal.mode}
        onCancel={() => setToolModal({ open: false, path: null, mode: 'create' })}
        onConfirm={(tools) => void onConfirmWorkspaceToolsModal(tools)}
      />
    </div>
  );
};

export default StickyNoteShell;
