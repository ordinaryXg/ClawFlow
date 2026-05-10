import { FC, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { PlusOutlined, SettingOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { Outlet, useNavigate } from 'react-router-dom';
import { useChatStore } from '../../store/modules/chatStore';
import { useWorkspaceStore } from '../../store/modules/workspaceStore';
import { useShellViewStore } from '../../store/modules/shellViewStore';
import { workspaceFolderLabel, workspacePathsLikelyEqual } from '../../utils/workspace-path';
import ViewModeFab from '../ViewModeFab';
import WorkspaceNewToolsModal from '../workspace/WorkspaceNewToolsModal';
import StickyFileStrip from './StickyFileStrip';
import type { WorkspaceToolSelection } from '../../shared/workspace-tools';
import './stickyNoteShell.css';

/** 主便签：拖出卫星窗口 */
const STICKY_TEAR_MIME = 'application/x-clawflow-sticky-tear';
/** 卫星便签：拖回主便签栏合并 */
const STICKY_MERGE_MIME = 'application/x-clawflow-sticky-merge';

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

  const setMode = useShellViewStore((s) => s.setMode);

  const [stickyBootstrap, setStickyBootstrap] = useState<{
    role: 'main' | 'satellite';
    satelliteWorkspace: string | null;
  } | null>(null);
  const [defaultWorkspacePath, setDefaultWorkspacePath] = useState<string | null>(null);
  const [detachedPaths, setDetachedPaths] = useState<string[]>([]);
  const [railMergeOver, setRailMergeOver] = useState(false);

  useEffect(() => {
    const api = window.electronAPI;
    if (!api?.stickyGetBootstrap) return;
    let unsub: (() => void) | undefined;
    void (async () => {
      try {
        const [boot, detached, defPath] = await Promise.all([
          api.stickyGetBootstrap(),
          api.stickyGetDetachedPaths?.() ?? Promise.resolve({ paths: [] as string[] }),
          api.workspaceGetDefaultPath?.() ?? Promise.resolve(null),
        ]);
        setStickyBootstrap(boot);
        setDetachedPaths(Array.isArray(detached.paths) ? detached.paths : []);
        setDefaultWorkspacePath(typeof defPath === 'string' && defPath.trim() ? defPath.trim() : null);
      } catch {
        setStickyBootstrap({ role: 'main', satelliteWorkspace: null });
      }
    })();
    unsub = api.onStickyDetachedPaths?.((p) => setDetachedPaths(Array.isArray(p.paths) ? p.paths : []));
    return () => unsub?.();
  }, []);

  const isSatellite =
    stickyBootstrap?.role === 'satellite' && Boolean(stickyBootstrap?.satelliteWorkspace?.trim());

  useEffect(() => {
    if (!isSatellite || !stickyBootstrap?.satelliteWorkspace) return;
    setMode('alternate');
    void setWorkspace(stickyBootstrap.satelliteWorkspace, { fromMainShell: false });
  }, [isSatellite, stickyBootstrap?.satelliteWorkspace, setMode, setWorkspace]);

  const isDefaultWorkspace = useCallback(
    (p: string) =>
      defaultWorkspacePath != null && workspacePathsLikelyEqual(p, defaultWorkspacePath),
    [defaultWorkspacePath]
  );

  const isPathDetached = useCallback(
    (p: string) => detachedPaths.some((d) => workspacePathsLikelyEqual(d, p)),
    [detachedPaths]
  );

  const workspaceRows = useMemo(() => {
    if (isSatellite && stickyBootstrap?.satelliteWorkspace) {
      return [stickyBootstrap.satelliteWorkspace];
    }
    const r = [...(workspaceRecent ?? [])];
    const act = activeWorkspacePath;
    if (act && !r.some((p) => workspacePathsLikelyEqual(p, act))) {
      r.unshift(act);
    }
    return r.filter((p) => !detachedPaths.some((d) => workspacePathsLikelyEqual(d, p)));
  }, [workspaceRecent, activeWorkspacePath, detachedPaths, isSatellite, stickyBootstrap?.satelliteWorkspace]);

  const canTearOffTab = useCallback(
    (path: string) =>
      stickyBootstrap?.role === 'main' &&
      defaultWorkspacePath != null &&
      !isDefaultWorkspace(path) &&
      !isPathDetached(path),
    [stickyBootstrap?.role, defaultWorkspacePath, isDefaultWorkspace, isPathDetached]
  );

  const onWorkspaceTabDragStart = useCallback(
    (path: string, kind: 'tear' | 'merge') => {
      return (e: React.DragEvent) => {
        const mime = kind === 'tear' ? STICKY_TEAR_MIME : STICKY_MERGE_MIME;
        e.dataTransfer.setData(mime, path);
        e.dataTransfer.setData('text/plain', path);
        e.dataTransfer.effectAllowed = 'copyMove';
      };
    },
    []
  );

  const onWorkspaceTabDragEnd = useCallback(
    (path: string) => {
      return (e: React.DragEvent) => {
        if (!canTearOffTab(path)) return;
        const ax = window.screenX;
        const ay = window.screenY;
        const aw = window.outerWidth;
        const ah = window.outerHeight;
        const sx = e.screenX;
        const sy = e.screenY;
        const margin = 16;
        const outside =
          sx < ax + margin || sy < ay + margin || sx > ax + aw - margin || sy > ay + ah - margin;
        if (!outside) return;
        void (async () => {
          const res = await window.electronAPI?.stickyOpenSatellite?.({ workspacePath: path });
          if (res && 'ok' in res && !res.ok && res.error === 'cannot_detach_default') {
            pushToast('error', t('sticky.detachDefaultForbidden'));
          }
        })();
      };
    },
    [canTearOffTab, t]
  );

  const railAcceptsMergeDrag = useCallback((e: React.DragEvent) => {
    return [...e.dataTransfer.types].includes(STICKY_MERGE_MIME);
  }, []);

  const onRailDragOver = useCallback(
    (e: React.DragEvent) => {
      if (!railAcceptsMergeDrag(e)) return;
      if (stickyBootstrap?.role !== 'main') return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      setRailMergeOver(true);
    },
    [railAcceptsMergeDrag, stickyBootstrap?.role]
  );

  const onRailDragLeave = useCallback((e: React.DragEvent) => {
    const cur = e.currentTarget;
    const rel = e.relatedTarget;
    if (rel && cur instanceof Node && cur.contains(rel as Node)) return;
    setRailMergeOver(false);
  }, []);

  const onRailDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      setRailMergeOver(false);
      if (stickyBootstrap?.role !== 'main') return;
      if (!railAcceptsMergeDrag(e)) return;
      const raw = e.dataTransfer.getData(STICKY_MERGE_MIME) || e.dataTransfer.getData('text/plain');
      const path = String(raw ?? '').trim();
      if (!path) return;
      const res = await window.electronAPI?.stickyMergeSatellite?.({ workspacePath: path });
      if (res && 'ok' in res && res.ok && res.closed) {
        await fetchConversations();
        await useWorkspaceStore.getState().refresh();
      }
    },
    [fetchConversations, railAcceptsMergeDrag, stickyBootstrap?.role]
  );

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
      <nav
        className={['cf-stickyRail', railMergeOver ? 'cf-stickyRail--mergeOver' : ''].filter(Boolean).join(' ')}
        aria-label={t('sticky.workspaceRailAria')}
        onDragOver={(ev) => onRailDragOver(ev)}
        onDragLeave={onRailDragLeave}
        onDrop={(ev) => void onRailDrop(ev)}
      >
        {workspaceRows.map((path) => {
          const active = activeWorkspacePath && workspacePathsLikelyEqual(path, activeWorkspacePath);
          const tearable = canTearOffTab(path);
          const draggable = isSatellite || tearable;
          const titleExtra = isSatellite
            ? t('sticky.mergeBackHint')
            : tearable
              ? t('sticky.tearOffHint')
              : path;
          return (
            <button
              key={path}
              type="button"
              draggable={draggable}
              onDragStart={draggable ? onWorkspaceTabDragStart(path, isSatellite ? 'merge' : 'tear') : undefined}
              onDragEnd={tearable ? onWorkspaceTabDragEnd(path) : undefined}
              className={`cf-stickyRail__tab${active ? ' cf-stickyRail__tab--active' : ''}${
                draggable ? ' cf-stickyRail__tab--draggable' : ''
              }`}
              onClick={() => void onPickWorkspace(path)}
              title={titleExtra}
            >
              <span className="cf-stickyRail__tabText">{workspaceFolderLabel(path)}</span>
            </button>
          );
        })}
        {!isSatellite ? (
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
        ) : null}
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
