import { FC, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  AppstoreOutlined,
  CaretDownOutlined,
  CaretRightOutlined,
  FileOutlined,
  FolderOutlined,
  LinkOutlined,
  SwapOutlined,
  UnorderedListOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { App } from 'antd';
import { useTranslation } from 'react-i18next';
import { useShellViewStore } from '../../store/modules/shellViewStore';
import {
  STICKY_LAUNCHER_MIME,
  dragPayloadToSaved,
  isOsLauncherStylePath,
  loadStickyLauncherItems,
  newLauncherItemId,
  parseLauncherDragPayload,
  saveStickyLauncherItems,
  type StickyLauncherDragPayloadV1,
  type StickyLauncherSavedItem,
} from '../../shared/sticky-launcher-items';

type Entry = { name: string; kind: 'file' | 'dir' };

export type StickyFileLayoutMode = 'tree' | 'grid';

const LAYOUT_KEY = 'clawflow.stickyFileLayoutMode';

function loadLayoutMode(): StickyFileLayoutMode {
  try {
    const v = localStorage.getItem(LAYOUT_KEY);
    if (v === 'grid' || v === 'tree') return v;
  } catch {
    /* ignore */
  }
  return 'tree';
}

function relPath(parent: string, name: string): string {
  return parent ? `${parent}/${name}` : name;
}

function normRelPath(r: string): string {
  return r.replace(/\\/g, '/');
}

/** 便签列表隐藏系统目录（仍存在于磁盘，仅不在 UI 展示） */
const STICKY_HIDDEN_DIRS = new Set([
  '.subagent',
  '.agent',
  '.roleAgent',
  '.tool',
  '.clawflow',
  '.subclawflow',
  '.submemory',
  '.clawflow-launcher-stash',
]);

function filterStickyEntries(list: Entry[]): Entry[] {
  return list.filter((e) => !(e.kind === 'dir' && STICKY_HIDDEN_DIRS.has(e.name)));
}

function normLauncherPathLower(s: string): string {
  return s.trim().toLowerCase().replace(/\\/g, '/');
}

function launchersReferencePath(items: StickyLauncherSavedItem[], abs: string): boolean {
  const t = normLauncherPathLower(abs);
  return items.some((x) => {
    if (x.kind !== 'path') return false;
    if (normLauncherPathLower(x.targetPath) === t) return true;
    if (x.desktopOriginalPath && normLauncherPathLower(x.desktopOriginalPath) === t) return true;
    return false;
  });
}

function pushToast(type: 'success' | 'error', title: string, message?: string): void {
  const api = (window as unknown as { __cf_toast?: { success: (t: string, m?: string) => void; error: (t: string, m?: string) => void } })
    .__cf_toast;
  if (!api) return;
  if (type === 'success') api.success(title, message);
  else api.error(title, message);
}

import { hasDataTransferFileDrag, pathsFromDataTransferFiles } from '../../utils/electron-data-transfer-files';

function hasLauncherDrag(e: React.DragEvent): boolean {
  return [...e.dataTransfer.types].includes(STICKY_LAUNCHER_MIME);
}

type Props = {
  workspacePath: string | null;
  /** 嵌入分栏：占满父级高度；文件列表不滚动（仅对话区滚动） */
  embedFill?: boolean;
};

const StickyFileStrip: FC<Props> = ({ workspacePath, embedFill }) => {
  const { t } = useTranslation();
  const { modal } = App.useApp();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [layoutMode, setLayoutMode] = useState<StickyFileLayoutMode>(loadLayoutMode);
  const [childMap, setChildMap] = useState<Record<string, Entry[]>>({});
  const [dirLoading, setDirLoading] = useState<Record<string, boolean>>({});
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [fileDragOver, setFileDragOver] = useState(false);
  const [selectedRel, setSelectedRel] = useState<string | null>(null);
  const [selectedLauncherId, setSelectedLauncherId] = useState<string | null>(null);
  const [launcherItems, setLauncherItems] = useState<StickyLauncherSavedItem[]>([]);
  const [fileCtx, setFileCtx] = useState<null | { x: number; y: number; rel: string }>(null);
  const [launcherCtx, setLauncherCtx] = useState<null | { x: number; y: number; id: string }>(null);
  const expandedRef = useRef(expanded);
  expandedRef.current = expanded;

  const launcherItemsRef = useRef<StickyLauncherSavedItem[]>([]);
  useEffect(() => {
    launcherItemsRef.current = launcherItems;
  }, [launcherItems]);

  const hydrateLauncherIconsForPaths = useCallback(
    async (targets: Array<{ id: string; targetPath: string }>) => {
      const api = window.electronAPI?.appGetFileIconDataUrl;
      if (!api || !workspacePath?.trim() || targets.length === 0) return;
      const ws = workspacePath.trim();
      for (const { id, targetPath } of targets) {
        const res = await api(targetPath);
        const dataUrl =
          res &&
          typeof res === 'object' &&
          res.ok === true &&
          'dataUrl' in res &&
          typeof (res as { dataUrl?: unknown }).dataUrl === 'string'
            ? (res as { dataUrl: string }).dataUrl
            : null;
        if (!dataUrl) continue;
        setLauncherItems(() => {
          const base = launcherItemsRef.current;
          const cur = base.find((x) => x.id === id);
          if (!cur || cur.kind !== 'path' || cur.iconDataUrl) return base;
          const next = base.map((x) => (x.id === id && x.kind === 'path' ? { ...x, iconDataUrl: dataUrl } : x));
          saveStickyLauncherItems(ws, next);
          launcherItemsRef.current = next;
          return next;
        });
      }
    },
    [workspacePath]
  );

  useEffect(() => {
    setSelectedRel(null);
    setSelectedLauncherId(null);
    setFileCtx(null);
    setLauncherCtx(null);
    const ws = workspacePath?.trim() ?? '';
    let cancelled = false;
    const run = async () => {
      const list = ws ? loadStickyLauncherItems(ws) : [];
      let current = list;
      const statApi = window.electronAPI?.workspaceStatAbsolutePath;
      if (statApi && ws) {
        const healed: StickyLauncherSavedItem[] = [];
        let changed = false;
        for (const x of list) {
          if (x.kind !== 'path' || !x.desktopOriginalPath) {
            healed.push(x);
            continue;
          }
          const st = await statApi(x.targetPath);
          const orig = await statApi(x.desktopOriginalPath);
          const stashMissing = !st || st.ok === false;
          const origOk = orig && orig.ok === true;
          if (stashMissing && origOk) {
            changed = true;
            const { desktopOriginalPath: _drop, ...rest } = x;
            healed.push({ ...rest, targetPath: x.desktopOriginalPath });
          } else {
            healed.push(x);
          }
        }
        if (changed) {
          current = healed;
          saveStickyLauncherItems(ws, healed);
        }
      }
      if (cancelled) return;
      void window.electronAPI?.appSweepLauncherStash?.({ workspacePath: ws });
      setLauncherItems(current);
      launcherItemsRef.current = current;
      const need = current
        .filter((x): x is StickyLauncherSavedItem & { kind: 'path' } => x.kind === 'path' && !x.iconDataUrl)
        .map((x) => ({ id: x.id, targetPath: x.targetPath }));
      if (need.length) void hydrateLauncherIconsForPaths(need);
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [workspacePath, hydrateLauncherIconsForPaths]);

  const persistLayout = (m: StickyFileLayoutMode) => {
    setLayoutMode(m);
    try {
      localStorage.setItem(LAYOUT_KEY, m);
    } catch {
      /* ignore */
    }
  };

  const loadDir = useCallback(
    async (rel: string) => {
      setDirLoading((d) => ({ ...d, [rel]: true }));
      try {
        const res = await window.electronAPI?.workspaceListDir?.(rel);
        if (!res?.ok) {
          setErr(res?.error ?? t('sticky.fileListError'));
          setChildMap((m) => ({ ...m, [rel]: [] }));
          return;
        }
        const list = Array.isArray(res.entries) ? res.entries : [];
        const sorted = filterStickyEntries(
          list
            .filter((e) => e && typeof e.name === 'string')
            .map((e) => ({ name: e.name, kind: (e.kind === 'dir' ? 'dir' : 'file') as Entry['kind'] }))
            .sort((a, b) => {
              if (a.kind !== b.kind) return a.kind === 'dir' ? -1 : 1;
              return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
            })
        );
        setChildMap((m) => ({ ...m, [rel]: sorted }));
      } catch (e: unknown) {
        setErr(e instanceof Error ? e.message : t('sticky.fileListError'));
        setChildMap((m) => ({ ...m, [rel]: [] }));
      } finally {
        setDirLoading((d) => {
          const n = { ...d };
          delete n[rel];
          return n;
        });
      }
    },
    [t]
  );

  const load = useCallback(async () => {
    if (!workspacePath?.trim()) {
      setEntries([]);
      setErr(null);
      setChildMap({});
      setExpanded(new Set());
      return;
    }
    setLoading(true);
    setErr(null);
    try {
      const res = await window.electronAPI?.workspaceListDir?.('');
      if (!res?.ok) {
        setErr(res?.error ?? t('sticky.fileListError'));
        setEntries([]);
        return;
      }
      const list = Array.isArray(res.entries) ? res.entries : [];
      setEntries(
        filterStickyEntries(
          list
            .filter((e) => e && typeof e.name === 'string')
            .map((e) => ({ name: e.name, kind: (e.kind === 'dir' ? 'dir' : 'file') as Entry['kind'] }))
            .sort((a, b) => {
              if (a.kind !== b.kind) return a.kind === 'dir' ? -1 : 1;
              return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
            })
        )
      );
      setChildMap({});
      const dirs = [...expandedRef.current];
      for (const d of dirs) {
        void loadDir(d);
      }
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : t('sticky.fileListError'));
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [workspacePath, t, loadDir]);

  useEffect(() => {
    void load();
  }, [load]);

  const tryAddLauncherFromDragPayload = useCallback(
    async (p: StickyLauncherDragPayloadV1): Promise<boolean> => {
      if (!workspacePath?.trim()) return false;
      const ws = workspacePath.trim();
      const prev = launcherItemsRef.current;

      if (p.kind === 'builtin') {
        const item = dragPayloadToSaved(p);
        if (item.kind !== 'builtin') return false;
        if (prev.some((x) => x.kind === 'builtin' && x.builtinId === item.builtinId)) {
          pushToast('error', t('sticky.launcherDupBuiltin'));
          return false;
        }
        const next = [...prev, item];
        saveStickyLauncherItems(ws, next);
        setLauncherItems(next);
        launcherItemsRef.current = next;
        pushToast('success', t('sticky.launcherAdded'));
        return true;
      }

      let item = dragPayloadToSaved(p) as StickyLauncherSavedItem & { kind: 'path' };
      if (launchersReferencePath(prev, item.targetPath)) {
        pushToast('error', t('sticky.launcherDupPath'));
        return false;
      }
      let leftOnDesktop = false;
      const hideApi = window.electronAPI?.appSetPathHidden;
      if (hideApi) {
        const r = await hideApi({ absolutePath: item.targetPath, hidden: true, workspacePath: ws });
        if (!r || r.ok === false) {
          pushToast('error', t('sticky.launcherStashFailed'), r && 'error' in r ? String(r.error) : undefined);
          return false;
        }
        if (r.ok && r.mode === 'stashed') {
          item = {
            id: item.id,
            kind: 'path',
            targetPath: r.stashedPath,
            label: item.label,
            desktopOriginalPath: r.originalPath,
          };
          if (r.leftSourceInPlace) leftOnDesktop = true;
        }
      }
      const next = [...prev, item];
      saveStickyLauncherItems(ws, next);
      setLauncherItems(next);
      launcherItemsRef.current = next;
      pushToast(
        'success',
        leftOnDesktop ? t('sticky.launcherStashPublicDup') : t('sticky.launcherAdded')
      );
      void hydrateLauncherIconsForPaths([{ id: item.id, targetPath: item.targetPath }]);
      return true;
    },
    [workspacePath, t, hydrateLauncherIconsForPaths]
  );

  const addOsShortcutPathsFromList = useCallback(
    async (paths: string[]) => {
      if (!workspacePath?.trim() || paths.length === 0) return;
      const ws = workspacePath.trim();
      const prev = launcherItemsRef.current;
      let next = [...prev];
      let anyNew = false;
      let anyLeftOnDesktop = false;
      const added: Array<{ id: string; targetPath: string }> = [];
      const hideApi = window.electronAPI?.appSetPathHidden;
      for (const abs of paths) {
        if (!isOsLauncherStylePath(abs)) continue;
        if (launchersReferencePath(next, abs)) continue;
        let targetPath = abs;
        let desktopOriginalPath: string | undefined;
        if (hideApi) {
          const r = await hideApi({ absolutePath: abs, hidden: true, workspacePath: ws });
          if (!r || r.ok === false) {
            pushToast('error', t('sticky.launcherStashFailed'), r && 'error' in r ? String(r.error) : undefined);
            continue;
          }
          if (r.ok && r.mode === 'stashed') {
            targetPath = r.stashedPath;
            desktopOriginalPath = r.originalPath;
            if (r.leftSourceInPlace) anyLeftOnDesktop = true;
          }
        }
        const label = abs.split(/[/\\]/).pop() || abs;
        const id = newLauncherItemId();
        const row: StickyLauncherSavedItem =
          desktopOriginalPath !== undefined
            ? { id, kind: 'path', targetPath, label, desktopOriginalPath }
            : { id, kind: 'path', targetPath, label };
        next.push(row);
        added.push({ id, targetPath });
        anyNew = true;
      }
      if (!anyNew) return;
      saveStickyLauncherItems(ws, next);
      setLauncherItems(next);
      launcherItemsRef.current = next;
      pushToast(
        'success',
        anyLeftOnDesktop ? t('sticky.launcherStashPublicDup') : t('sticky.launcherAdded')
      );
      void hydrateLauncherIconsForPaths(added);
    },
    [workspacePath, t, hydrateLauncherIconsForPaths]
  );

  const runExternalImport = useCallback(
    async (targetRelativeDir: string, dt: DataTransfer) => {
      const paths = pathsFromDataTransferFiles(dt);
      if (paths.length === 0) {
        pushToast('error', t('sticky.importNoPaths'));
        return;
      }
      const shortcutPaths = paths.filter(isOsLauncherStylePath);
      const normalPaths = paths.filter((p) => !isOsLauncherStylePath(p));
      if (shortcutPaths.length) await addOsShortcutPathsFromList(shortcutPaths);
      if (normalPaths.length === 0) return;
      const res = await window.electronAPI?.workspaceImportExternalPaths?.({
        targetRelativeDir,
        sourceAbsolutePaths: normalPaths,
        overwrite: true,
      });
      if (!res || res.ok === false) {
        pushToast('error', t('sticky.importFailed'), res && res.ok === false ? res.error : undefined);
        return;
      }
      pushToast('success', t('sticky.importSuccess', { count: normalPaths.length }));
      await load();
    },
    [addOsShortcutPathsFromList, load, t]
  );

  const onDropTarget =
    (targetRelativeDir: string) =>
    async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setFileDragOver(false);
      const raw = e.dataTransfer.getData(STICKY_LAUNCHER_MIME);
      if (raw) {
        const p = parseLauncherDragPayload(raw);
        if (p) {
          await tryAddLauncherFromDragPayload(p);
          return;
        }
      }
      if (!hasDataTransferFileDrag(e.dataTransfer)) return;
      await runExternalImport(targetRelativeDir, e.dataTransfer);
    };

  const onDragOverTarget = (e: React.DragEvent) => {
    if (!hasDataTransferFileDrag(e.dataTransfer) && !hasLauncherDrag(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = hasLauncherDrag(e) ? 'copy' : 'move';
  };

  const onBodyDragEnter = (e: React.DragEvent) => {
    if (!hasDataTransferFileDrag(e.dataTransfer) && !hasLauncherDrag(e)) return;
    setFileDragOver(true);
  };

  const onBodyDragLeave = (e: React.DragEvent) => {
    if (!hasDataTransferFileDrag(e.dataTransfer) && !hasLauncherDrag(e)) return;
    const cur = e.currentTarget;
    const rel = e.relatedTarget;
    if (rel && cur instanceof Node && cur.contains(rel as Node)) return;
    setFileDragOver(false);
  };

  const revealInExplorer = useCallback(async (rel: string) => {
    try {
      await window.electronAPI?.workspaceRevealInExplorer?.(rel);
    } catch {
      /* ignore */
    }
  }, []);

  const copyTextToClipboard = useCallback(async (text: string) => {
    const s = String(text ?? '');
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(s);
        return;
      }
    } catch {
      /* fall through */
    }
    try {
      await window.electronAPI?.clipboardWriteText?.(s);
    } catch {
      /* ignore */
    }
  }, []);

  const copyRelPath = useCallback(
    async (rel: string) => {
      await copyTextToClipboard(rel);
      pushToast('success', t('common.copiedTitle'), t('common.copiedBody'));
    },
    [copyTextToClipboard, t]
  );

  const copyFullPath = useCallback(
    async (rel: string) => {
      try {
        const res = await window.electronAPI?.workspaceResolveAbsolutePath?.(rel);
        if (res?.absolutePath) {
          await copyTextToClipboard(res.absolutePath);
          pushToast('success', t('common.copiedTitle'), t('common.copiedBody'));
        }
      } catch {
        pushToast('error', t('common.copyFailedTitle'), t('common.copyFailedBody'));
      }
    },
    [copyTextToClipboard, t]
  );

  const closeFileCtx = useCallback(() => {
    setFileCtx(null);
    setLauncherCtx(null);
  }, []);

  const removeLauncher = useCallback(
    (id: string) => {
      setLauncherCtx(null);
      if (!workspacePath?.trim()) return;
      const ws = workspacePath.trim();
      const victim = launcherItemsRef.current.find((x) => x.id === id);
      if (victim?.kind === 'path') {
        void window.electronAPI?.appSetPathHidden?.({
          absolutePath: victim.targetPath,
          hidden: false,
          workspacePath: ws,
        });
      }
      setLauncherItems((prev) => {
        const next = prev.filter((x) => x.id !== id);
        saveStickyLauncherItems(ws, next);
        launcherItemsRef.current = next;
        return next;
      });
      setSelectedLauncherId((s) => (s === id ? null : s));
    },
    [workspacePath]
  );

  const openLauncherItem = useCallback(
    async (item: StickyLauncherSavedItem) => {
      if (item.kind === 'builtin') {
        if (item.builtinId === 'viewMode') {
          useShellViewStore.getState().toggleMode();
          return;
        }
        window.dispatchEvent(new Event('cf-open-intelligence-popover'));
        return;
      }
      const res = await window.electronAPI?.appOpenPath?.(item.targetPath);
      if (!res?.ok) {
        pushToast('error', t('sticky.launcherOpenFailed'), res && 'error' in res ? String(res.error) : undefined);
      }
    },
    [t]
  );

  const pruneExpandedForDeleted = useCallback((deletedRel: string) => {
    const norm = deletedRel.replace(/\\/g, '/');
    setExpanded((prev) => {
      const n = new Set(prev);
      for (const p of [...n]) {
        const pn = p.replace(/\\/g, '/');
        if (pn === norm || pn.startsWith(`${norm}/`)) n.delete(p);
      }
      return n;
    });
  }, []);

  const requestDelete = useCallback(
    (rel: string) => {
      closeFileCtx();
      modal.confirm({
        title: t('sticky.fileDeleteConfirmTitle'),
        content: rel,
        okText: t('common.delete'),
        cancelText: t('common.cancel'),
        okType: 'danger',
        onOk: async () => {
          const res = await window.electronAPI?.workspaceDeletePath?.(rel);
          if (!res?.ok) {
            pushToast('error', t('sticky.fileDeleteFailed'), res?.error);
            throw new Error(res?.error || 'delete failed');
          }
          pruneExpandedForDeleted(rel);
          setSelectedRel((s) => {
            if (!s) return null;
            const sn = normRelPath(s);
            const del = normRelPath(rel);
            if (sn === del || sn.startsWith(`${del}/`)) return null;
            return s;
          });
          await load();
        },
      });
    },
    [closeFileCtx, load, modal, pruneExpandedForDeleted, t]
  );

  const onOpen = async (rel: string) => {
    try {
      await window.electronAPI?.workspaceRevealInExplorer?.(rel);
    } catch {
      /* ignore */
    }
  };

  const toggleDir = (dirRel: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(dirRel)) next.delete(dirRel);
      else {
        next.add(dirRel);
        if (!childMap[dirRel]) void loadDir(dirRel);
      }
      return next;
    });
  };

  const onBodyMouseDown = (e: React.MouseEvent) => {
    const el = e.target as HTMLElement;
    if (
      el.closest('.cf-stickyFiles__rowBtn') ||
      el.closest('.cf-stickyFiles__gridCell') ||
      el.closest('.cf-stickyFiles__chev') ||
      el.closest('.cf-stickyFiles__launcherRow')
    ) {
      return;
    }
    setSelectedRel(null);
    setSelectedLauncherId(null);
  };

  const rootClass = useMemo(() => {
    const base = embedFill ? 'cf-stickyFiles cf-stickyFiles--embedFill' : 'cf-stickyFiles';
    const lay = layoutMode === 'grid' ? ' cf-stickyFiles--layoutGrid' : ' cf-stickyFiles--layoutTree';
    const drag = fileDragOver ? ' cf-stickyFiles--fileDragOver' : '';
    return base + lay + drag;
  }, [embedFill, layoutMode, fileDragOver]);

  if (!workspacePath) {
    return (
      <div className={embedFill ? `${rootClass} cf-stickyFiles--emptyEmbed` : 'cf-stickyFiles cf-stickyFiles--empty'}>
        <span className="cf-stickyFiles__hint">{t('sticky.pickWorkspaceFirst')}</span>
      </div>
    );
  }

  const renderTreeRows = (list: Entry[], parentRel: string, depth: number): ReactNode => {
    return list.map((e) => {
      const rel = relPath(parentRel, e.name);
      const isDir = e.kind === 'dir';
      const isExp = expanded.has(rel);
      const kids = childMap[rel];
      const loadingDir = dirLoading[rel];
      const isSelected = selectedRel === rel && selectedLauncherId == null;

      const dropTargetRel = isDir ? rel : parentRel;

      return (
        <li key={rel} className="cf-stickyFiles__treeItem">
          <div
            className="cf-stickyFiles__treeRow"
            style={{ paddingLeft: 6 + depth * 12 }}
            onDragOver={onDragOverTarget}
            onDrop={onDropTarget(dropTargetRel)}
          >
            {isDir ? (
              <button
                type="button"
                className="cf-stickyFiles__chev"
                aria-expanded={isExp}
                aria-label={t('sticky.fileTreeToggleDir', { name: e.name })}
                onClick={(ev) => {
                  ev.stopPropagation();
                  toggleDir(rel);
                }}
              >
                {loadingDir ? (
                  <span className="cf-stickyFiles__chevBusy">…</span>
                ) : isExp ? (
                  <CaretDownOutlined />
                ) : (
                  <CaretRightOutlined />
                )}
              </button>
            ) : (
              <span className="cf-stickyFiles__chevSpacer" aria-hidden />
            )}
            <button
              type="button"
              className={`cf-stickyFiles__rowBtn cf-stickyFiles__rowBtn--tree${isSelected ? ' cf-stickyFiles__rowBtn--selected' : ''}`}
              aria-selected={isSelected}
              onClick={() => {
                setSelectedRel(rel);
                setSelectedLauncherId(null);
              }}
              onContextMenu={(ev) => {
                ev.preventDefault();
                setLauncherCtx(null);
                setFileCtx({ x: ev.clientX, y: ev.clientY, rel });
              }}
              onDoubleClick={(ev) => {
                ev.preventDefault();
                void onOpen(rel);
              }}
              title={rel}
            >
              {isDir ? (
                <FolderOutlined className="cf-stickyFiles__icon" aria-hidden />
              ) : (
                <FileOutlined className="cf-stickyFiles__icon" aria-hidden />
              )}
              <span className="cf-stickyFiles__name">{e.name}</span>
            </button>
          </div>
          {isDir && isExp && kids && kids.length > 0 ? (
            <ul className="cf-stickyFiles__treeNested">{renderTreeRows(kids, rel, depth + 1)}</ul>
          ) : null}
          {isDir && isExp && kids && kids.length === 0 && !loadingDir ? (
            <div className="cf-stickyFiles__treeEmpty" style={{ paddingLeft: 28 + depth * 12 }}>
              {t('sticky.fileTreeEmptyDir')}
            </div>
          ) : null}
        </li>
      );
    });
  };

  return (
    <div className={rootClass} role="region" aria-label={t('sticky.fileListAria')}>
      <div className="cf-stickyFiles__head">
        <span>{t('sticky.workspaceFiles')}</span>
        <div className="cf-stickyFiles__headActions">
          <div className="cf-stickyFiles__layoutToggle" role="group" aria-label={t('sticky.fileLayoutGroupAria')}>
            <button
              type="button"
              className={`cf-stickyFiles__layoutBtn${layoutMode === 'tree' ? ' cf-stickyFiles__layoutBtn--active' : ''}`}
              onClick={() => persistLayout('tree')}
              title={t('sticky.fileLayoutTree')}
              aria-pressed={layoutMode === 'tree'}
            >
              <UnorderedListOutlined aria-hidden />
            </button>
            <button
              type="button"
              className={`cf-stickyFiles__layoutBtn${layoutMode === 'grid' ? ' cf-stickyFiles__layoutBtn--active' : ''}`}
              onClick={() => persistLayout('grid')}
              title={t('sticky.fileLayoutGrid')}
              aria-pressed={layoutMode === 'grid'}
            >
              <AppstoreOutlined aria-hidden />
            </button>
          </div>
          <button
            type="button"
            className="cf-stickyFiles__refresh"
            onClick={() => {
              void load();
              const need: Array<{ id: string; targetPath: string }> = [];
              for (const x of launcherItemsRef.current) {
                if (x.kind === 'path' && !x.iconDataUrl) need.push({ id: x.id, targetPath: x.targetPath });
              }
              if (need.length) void hydrateLauncherIconsForPaths(need);
            }}
            disabled={loading}
          >
            {loading ? '…' : t('sticky.refreshFiles')}
          </button>
        </div>
      </div>
      {err ? <div className="cf-stickyFiles__err">{err}</div> : null}
      <div
        className="cf-stickyFiles__body"
        onMouseDown={onBodyMouseDown}
        onDragEnter={onBodyDragEnter}
        onDragLeave={onBodyDragLeave}
        onDragOver={onDragOverTarget}
        onDrop={onDropTarget('')}
      >
        {layoutMode === 'grid' ? (
          <div
            className="cf-stickyFiles__grid"
            onDragOver={onDragOverTarget}
            onDrop={(e) => {
              e.stopPropagation();
              void onDropTarget('')(e);
            }}
          >
            {entries.length === 0 && launcherItems.length === 0 && !loading && !err ? (
              <div className="cf-stickyFiles__gridEmpty">{t('sticky.fileListEmpty')}</div>
            ) : null}
            {entries.map((e) => {
              const rel = e.name;
              const isSelected = selectedRel === rel && selectedLauncherId == null;
              return (
                <button
                  key={rel}
                  type="button"
                  className={`cf-stickyFiles__gridCell${isSelected ? ' cf-stickyFiles__gridCell--selected' : ''}`}
                  aria-selected={isSelected}
                  onClick={() => {
                    setSelectedRel(rel);
                    setSelectedLauncherId(null);
                  }}
                  onContextMenu={(ev) => {
                    ev.preventDefault();
                    setLauncherCtx(null);
                    setFileCtx({ x: ev.clientX, y: ev.clientY, rel });
                  }}
                  onDoubleClick={(ev) => {
                    ev.preventDefault();
                    void onOpen(rel);
                  }}
                  title={rel}
                >
                  {e.kind === 'dir' ? (
                    <FolderOutlined className="cf-stickyFiles__gridIcon" aria-hidden />
                  ) : (
                    <FileOutlined className="cf-stickyFiles__gridIcon" aria-hidden />
                  )}
                  <span className="cf-stickyFiles__gridName">{e.name}</span>
                </button>
              );
            })}
            {launcherItems.map((item) => {
              const isSelected = selectedLauncherId === item.id;
              const icon =
                item.kind === 'builtin' && item.builtinId === 'intelligence' ? (
                  <UserOutlined className="cf-stickyFiles__gridIcon" aria-hidden />
                ) : item.kind === 'builtin' ? (
                  <SwapOutlined className="cf-stickyFiles__gridIcon" aria-hidden />
                ) : item.iconDataUrl ? (
                  <img
                    src={item.iconDataUrl}
                    alt=""
                    className="cf-stickyFiles__launcherIconImg cf-stickyFiles__launcherIconImg--grid"
                  />
                ) : (
                  <LinkOutlined className="cf-stickyFiles__gridIcon" aria-hidden />
                );
              return (
                <button
                  key={item.id}
                  type="button"
                  className={`cf-stickyFiles__gridCell cf-stickyFiles__launcherCell${
                    isSelected ? ' cf-stickyFiles__gridCell--selected' : ''
                  }`}
                  aria-selected={isSelected}
                  onClick={() => {
                    setSelectedLauncherId(item.id);
                    setSelectedRel(null);
                  }}
                  onContextMenu={(ev) => {
                    ev.preventDefault();
                    setFileCtx(null);
                    setLauncherCtx({ x: ev.clientX, y: ev.clientY, id: item.id });
                  }}
                  onDoubleClick={(ev) => {
                    ev.preventDefault();
                    void openLauncherItem(item);
                  }}
                  title={item.label}
                >
                  {icon}
                  <span className="cf-stickyFiles__gridName">{item.label}</span>
                </button>
              );
            })}
          </div>
        ) : (
          <>
            <ul className="cf-stickyFiles__list cf-stickyFiles__list--tree">
              {entries.length === 0 && launcherItems.length === 0 && !loading && !err ? (
                <li className="cf-stickyFiles__emptyRow">{t('sticky.fileListEmpty')}</li>
              ) : null}
              {renderTreeRows(entries, '', 0)}
            </ul>
            {launcherItems.length > 0 ? (
              <div className="cf-stickyFiles__launcherTreeWrap">
                <div className="cf-stickyFiles__launcherTreeHead">{t('sticky.fileSectionLauncher')}</div>
                <ul className="cf-stickyFiles__list cf-stickyFiles__list--launcherTree">
                  {launcherItems.map((item) => {
                    const isSelected = selectedLauncherId === item.id;
                    const rowIcon =
                      item.kind === 'builtin' && item.builtinId === 'intelligence' ? (
                        <UserOutlined className="cf-stickyFiles__icon" aria-hidden />
                      ) : item.kind === 'builtin' ? (
                        <SwapOutlined className="cf-stickyFiles__icon" aria-hidden />
                      ) : item.iconDataUrl ? (
                        <img src={item.iconDataUrl} alt="" className="cf-stickyFiles__launcherIconImg" />
                      ) : (
                        <LinkOutlined className="cf-stickyFiles__icon" aria-hidden />
                      );
                    return (
                      <li key={item.id} className="cf-stickyFiles__launcherTreeItem">
                        <button
                          type="button"
                          className={`cf-stickyFiles__rowBtn cf-stickyFiles__launcherRow${
                            isSelected ? ' cf-stickyFiles__rowBtn--selected' : ''
                          }`}
                          aria-selected={isSelected}
                          onClick={() => {
                            setSelectedLauncherId(item.id);
                            setSelectedRel(null);
                          }}
                          onContextMenu={(ev) => {
                            ev.preventDefault();
                            setFileCtx(null);
                            setLauncherCtx({ x: ev.clientX, y: ev.clientY, id: item.id });
                          }}
                          onDoubleClick={(ev) => {
                            ev.preventDefault();
                            void openLauncherItem(item);
                          }}
                          title={item.kind === 'path' ? item.targetPath : item.label}
                        >
                          {rowIcon}
                          <span className="cf-stickyFiles__name">{item.label}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : null}
          </>
        )}
      </div>
      {fileCtx
        ? createPortal(
            <div
              className="cf-ctxMenu__backdrop"
              onMouseDown={closeFileCtx}
              onContextMenu={(e) => {
                e.preventDefault();
                closeFileCtx();
              }}
            >
              <div
                className="cf-ctxMenu cf-stickyFiles__ctxMenu"
                style={{ left: fileCtx.x, top: fileCtx.y, zIndex: 5000 }}
                role="menu"
                onMouseDown={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  className="cf-ctxMenu__item"
                  onClick={() => {
                    void revealInExplorer(fileCtx.rel);
                    closeFileCtx();
                  }}
                >
                  {t('sticky.fileCtxReveal')}
                </button>
                <div className="cf-ctxMenu__sep" />
                <button
                  type="button"
                  className="cf-ctxMenu__item"
                  onClick={() => {
                    void copyRelPath(fileCtx.rel);
                    closeFileCtx();
                  }}
                >
                  {t('sticky.fileCtxCopyRel')}
                </button>
                <button
                  type="button"
                  className="cf-ctxMenu__item"
                  onClick={() => {
                    void copyFullPath(fileCtx.rel);
                    closeFileCtx();
                  }}
                >
                  {t('sticky.fileCtxCopyFull')}
                </button>
                <div className="cf-ctxMenu__sep" />
                <button
                  type="button"
                  className="cf-ctxMenu__item cf-ctxMenu__item--danger"
                  onClick={() => requestDelete(fileCtx.rel)}
                >
                  {t('sticky.fileCtxDelete')}
                </button>
              </div>
            </div>,
            document.body
          )
        : null}
      {launcherCtx
        ? createPortal(
            <div
              className="cf-ctxMenu__backdrop"
              onMouseDown={closeFileCtx}
              onContextMenu={(e) => {
                e.preventDefault();
                closeFileCtx();
              }}
            >
              <div
                className="cf-ctxMenu cf-stickyFiles__ctxMenu"
                style={{ left: launcherCtx.x, top: launcherCtx.y, zIndex: 5000 }}
                role="menu"
                onMouseDown={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  className="cf-ctxMenu__item"
                  onClick={() => {
                    removeLauncher(launcherCtx.id);
                    closeFileCtx();
                  }}
                >
                  {t('sticky.launcherCtxRemove')}
                </button>
              </div>
            </div>,
            document.body
          )
        : null}
    </div>
  );
};

export default StickyFileStrip;
