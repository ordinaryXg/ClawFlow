import { FC, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { PlusOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { Outlet, useNavigate } from 'react-router-dom';
import { useChatStore } from '../../store/modules/chatStore';
import { useWorkspaceStore } from '../../store/modules/workspaceStore';
import { workspaceFolderLabel, workspacePathsLikelyEqual } from '../../utils/workspace-path';
import StickyFileStrip from './StickyFileStrip';
import './stickyNoteShell.css';

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

function isWindowsOs(): boolean {
  return typeof navigator !== 'undefined' && /Windows/i.test(navigator.userAgent);
}

/**
 * 便签式桌面布局：左侧工作区标签（独立滚动）、顶栏、中间上下分栏（文件区 / 对话区，可拖拽调节高度；仅对话消息区滚动）。
 */
const StickyNoteShell: FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const showWinFrameCaps = isWindowsOs();

  const activeWorkspacePath = useWorkspaceStore((s) => s.activePath);
  const workspaceMeta = useWorkspaceStore((s) => s.meta);
  const workspaceRecent = useWorkspaceStore((s) => s.recent);
  const setWorkspace = useWorkspaceStore((s) => s.setWorkspace);
  const pickFolder = useWorkspaceStore((s) => s.pickFolder);
  const refreshWorkspace = useWorkspaceStore((s) => s.refresh);

  const { fetchConversations, createConversation } = useChatStore();

  const splitWrapRef = useRef<HTMLDivElement | null>(null);
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
    await pickFolder();
    await refreshWorkspace();
    navigate('/chat');
  };

  const onPickWorkspace = async (folderPath: string) => {
    await setWorkspace(folderPath);
    await fetchConversations();
    navigate('/chat');
  };

  const onNewSession = async () => {
    await createConversation();
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
          className="cf-stickyRail__add"
          onClick={() => void onAddWorkspace()}
          aria-label={t('sticky.addWorkspace')}
          title={t('workspace.openFolder')}
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
            <span className="cf-stickyMain__sortPill" title={t('sticky.sortPlaceholder')}>
              {t('sticky.sortDefault')}
            </span>
            <button type="button" className="cf-stickyMain__newBtn" onClick={() => void onNewSession()}>
              {t('sticky.newSession')}
            </button>
            {showWinFrameCaps ? (
              <div className="cf-stickyMain__winCaps" role="toolbar" aria-label={t('sticky.windowControls')}>
                <button
                  type="button"
                  className="cf-stickyMain__winCap"
                  aria-label={t('titlebar.minimize')}
                  onClick={() => void window.electronAPI?.windowMinimize?.()}
                >
                  —
                </button>
                <button
                  type="button"
                  className="cf-stickyMain__winCap"
                  aria-label={t('titlebar.toggleMaximize')}
                  onClick={() => void window.electronAPI?.windowToggleMaximize?.()}
                >
                  □
                </button>
                <button
                  type="button"
                  className="cf-stickyMain__winCap cf-stickyMain__winCap--close"
                  aria-label={t('titlebar.closeWindow')}
                  onClick={() => void window.electronAPI?.windowClose?.()}
                >
                  ✕
                </button>
              </div>
            ) : null}
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
    </div>
  );
};

export default StickyNoteShell;
