import { FC, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  AppstoreOutlined,
  CaretDownOutlined,
  CaretRightOutlined,
  FileOutlined,
  FolderOutlined,
  UnorderedListOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';

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

/** 便签列表隐藏系统目录（仍存在于磁盘，仅不在 UI 展示） */
const STICKY_HIDDEN_DIRS = new Set(['.clawflow', '.roleAgent']);

function filterStickyEntries(list: Entry[]): Entry[] {
  return list.filter((e) => !(e.kind === 'dir' && STICKY_HIDDEN_DIRS.has(e.name)));
}

function pushToast(type: 'success' | 'error', title: string, message?: string): void {
  const api = (window as unknown as { __cf_toast?: { success: (t: string, m?: string) => void; error: (t: string, m?: string) => void } })
    .__cf_toast;
  if (!api) return;
  if (type === 'success') api.success(title, message);
  else api.error(title, message);
}

function pathsFromDataTransfer(dt: DataTransfer): string[] {
  const api = window.electronAPI;
  if (!api?.getPathForFile || dt.files.length === 0) return [];
  const out: string[] = [];
  for (let i = 0; i < dt.files.length; i++) {
    try {
      out.push(api.getPathForFile(dt.files[i]));
    } catch {
      /* ignore */
    }
  }
  return out;
}

function hasFileDrag(e: React.DragEvent): boolean {
  return [...e.dataTransfer.types].includes('Files');
}

type Props = {
  workspacePath: string | null;
  /** 嵌入分栏：占满父级高度；文件列表不滚动（仅对话区滚动） */
  embedFill?: boolean;
};

const StickyFileStrip: FC<Props> = ({ workspacePath, embedFill }) => {
  const { t } = useTranslation();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [layoutMode, setLayoutMode] = useState<StickyFileLayoutMode>(loadLayoutMode);
  const [childMap, setChildMap] = useState<Record<string, Entry[]>>({});
  const [dirLoading, setDirLoading] = useState<Record<string, boolean>>({});
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [fileDragOver, setFileDragOver] = useState(false);
  const expandedRef = useRef(expanded);
  expandedRef.current = expanded;

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

  const runExternalImport = useCallback(
    async (targetRelativeDir: string, dt: DataTransfer) => {
      const paths = pathsFromDataTransfer(dt);
      if (paths.length === 0) {
        pushToast('error', t('sticky.importNoPaths'));
        return;
      }
      const res = await window.electronAPI?.workspaceImportExternalPaths?.({
        targetRelativeDir,
        sourceAbsolutePaths: paths,
        overwrite: true,
      });
      if (!res || res.ok === false) {
        pushToast('error', t('sticky.importFailed'), res && res.ok === false ? res.error : undefined);
        return;
      }
      pushToast('success', t('sticky.importSuccess', { count: paths.length }));
      await load();
    },
    [load, t]
  );

  const onDropTarget =
    (targetRelativeDir: string) =>
    async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setFileDragOver(false);
      if (!hasFileDrag(e)) return;
      await runExternalImport(targetRelativeDir, e.dataTransfer);
    };

  const onDragOverTarget = (e: React.DragEvent) => {
    if (!hasFileDrag(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const onBodyDragEnter = (e: React.DragEvent) => {
    if (!hasFileDrag(e)) return;
    setFileDragOver(true);
  };

  const onBodyDragLeave = (e: React.DragEvent) => {
    if (!hasFileDrag(e)) return;
    const cur = e.currentTarget;
    const rel = e.relatedTarget;
    if (rel && cur instanceof Node && cur.contains(rel as Node)) return;
    setFileDragOver(false);
  };

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
              className="cf-stickyFiles__rowBtn cf-stickyFiles__rowBtn--tree"
              onClick={() => void onOpen(rel)}
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
          <button type="button" className="cf-stickyFiles__refresh" onClick={() => void load()} disabled={loading}>
            {loading ? '…' : t('sticky.refreshFiles')}
          </button>
        </div>
      </div>
      {err ? <div className="cf-stickyFiles__err">{err}</div> : null}
      <div
        className="cf-stickyFiles__body"
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
            {entries.length === 0 && !loading && !err ? (
              <div className="cf-stickyFiles__gridEmpty">{t('sticky.fileListEmpty')}</div>
            ) : null}
            {entries.map((e) => {
              const rel = e.name;
              return (
                <button
                  key={rel}
                  type="button"
                  className="cf-stickyFiles__gridCell"
                  onClick={() => void onOpen(rel)}
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
          </div>
        ) : (
          <ul className="cf-stickyFiles__list cf-stickyFiles__list--tree">
            {entries.length === 0 && !loading && !err ? (
              <li className="cf-stickyFiles__emptyRow">{t('sticky.fileListEmpty')}</li>
            ) : null}
            {renderTreeRows(entries, '', 0)}
          </ul>
        )}
      </div>
    </div>
  );
};

export default StickyFileStrip;
