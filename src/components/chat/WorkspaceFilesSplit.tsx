import {
  FC,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type MouseEvent,
  type ReactElement,
} from 'react';
import { useTranslation } from 'react-i18next';
import Markdown from 'markdown-to-jsx';
import hljs from 'highlight.js';
import 'highlight.js/styles/github-dark.css';
import { clampWidth, startShellColumnDrag } from '../../hooks/usePersistedShellWidth';
import { WORKSPACE_IMAGE_PREVIEW_MAX_MB } from '../../shared/workspace-preview-limits';
import { FilePreviewPdfCanvas } from './FilePreviewPdfCanvas';
import { CsvPreviewTable } from './CsvPreviewTable';
import { parseCsvForPreview } from './csvPreviewParse';
import './chat.css';

type Entry = { name: string; kind: 'file' | 'dir' };
type ContextTarget =
  | { kind: 'root' }
  | { kind: 'dir'; rel: string }
  | { kind: 'file'; rel: string };

function targetRel(target: ContextTarget): string | null {
  return target.kind === 'root' ? null : target.rel;
}

const TREE_PREVIEW_GUTTER_PX = 6;
const TREE_COL_MIN_PX = 96;
const PREVIEW_COL_MIN_PX = 96;
const TREE_SPLIT_RATIO_KEY = 'clawflow.workspace.treeSplitRatio';

function loadTreeSplitRatio(): number {
  try {
    const r = Number(localStorage.getItem(TREE_SPLIT_RATIO_KEY));
    if (Number.isFinite(r) && r >= 0.18 && r <= 0.82) return r;
  } catch {
    /* ignore */
  }
  return 0.44;
}

function joinRel(parent: string, name: string): string {
  const p = parent.replace(/\\/g, '/').replace(/\/+$/, '');
  return p ? `${p}/${name}` : name;
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

function hasFileDrag(e: DragEvent): boolean {
  return [...e.dataTransfer.types].includes('Files');
}

function isMarkdownFilename(rel: string): boolean {
  const base = rel.replace(/\\/g, '/').split('/').pop()?.toLowerCase() ?? '';
  return base.endsWith('.md') || base.endsWith('.markdown');
}

function isCsvFilename(rel: string): boolean {
  const base = rel.replace(/\\/g, '/').split('/').pop()?.toLowerCase() ?? '';
  return base.endsWith('.csv');
}

function safeTextToHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

const WorkspaceFilesSplit: FC<{ workspacePath: string | null }> = ({ workspacePath }) => {
  const { t } = useTranslation();
  const splitRef = useRef<HTMLDivElement>(null);
  const [splitInnerW, setSplitInnerW] = useState(0);
  const [treeSplitRatio, setTreeSplitRatio] = useState(loadTreeSplitRatio);

  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(['']));
  const [children, setChildren] = useState<Map<string, Entry[]>>(new Map());
  const [loading, setLoading] = useState<Set<string>>(new Set());
  const [errors, setErrors] = useState<Map<string, string>>(new Map());
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [preview, setPreview] = useState<
    | { state: 'idle' }
    | { state: 'loading' }
    | { state: 'text'; content: string; truncated: boolean }
    | { state: 'image'; dataUrl: string }
    | {
        state: 'pdf';
        pdfBase64: string;
        textExtract: string;
        truncated: boolean;
        numpages?: number;
      }
    | { state: 'binary' }
    | { state: 'error'; message: string }
  >({ state: 'idle' });
  const [mdViewMode, setMdViewMode] = useState<'preview' | 'source'>('preview');

  const [ctxMenu, setCtxMenu] = useState<null | { x: number; y: number; target: ContextTarget }>(null);
  const [dialog, setDialog] = useState<
    | null
    | { kind: 'newFile' | 'newDir' | 'rename' | 'delete'; baseRel: string; initialName: string; target?: ContextTarget }
  >(null);
  const [fileDragOver, setFileDragOver] = useState(false);

  const markdownOptions = useMemo(
    () => ({
      forceBlock: true,
      disableParsingRawHTML: true,
      overrides: {
        code: {
          component: ({
            className,
            children,
            ...props
          }: {
            className?: string;
            children?: React.ReactNode;
          } & Record<string, unknown>) => {
            const raw = Array.isArray(children) ? children.join('') : String(children ?? '');
            const language =
              typeof className === 'string' ? className.replace('lang-', '').replace('language-', '') : '';

            const highlighted = (() => {
              try {
                if (language && hljs.getLanguage(language)) {
                  return hljs.highlight(raw, { language }).value;
                }
                return hljs.highlightAuto(raw).value;
              } catch {
                return safeTextToHtml(raw);
              }
            })();

            return (
              <code
                {...props}
                className={className}
                dangerouslySetInnerHTML={{ __html: highlighted }}
              />
            );
          },
        },
        pre: {
          component: ({ children, ...props }: { children?: React.ReactNode } & Record<string, unknown>) => (
            <pre {...props} className="cf-codeBlock">
              {children}
            </pre>
          ),
        },
      },
    }),
    []
  );

  const loadDir = useCallback(async (rel: string) => {
    const key = rel;
    setLoading((s) => new Set(s).add(key));
    setErrors((m) => {
      const n = new Map(m);
      n.delete(key);
      return n;
    });
    try {
      const res = await window.electronAPI?.workspaceListDir?.(rel);
      if (!res?.ok) {
        setErrors((m) => new Map(m).set(key, res?.error || t('chat.rightTabs.treeLoadFail')));
        setChildren((m) => new Map(m).set(key, []));
        return;
      }
      setChildren((m) => new Map(m).set(key, res.entries ?? []));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setErrors((m) => new Map(m).set(key, msg));
    } finally {
      setLoading((s) => {
        const n = new Set(s);
        n.delete(key);
        return n;
      });
    }
  }, [t]);

  const closeCtxMenu = () => setCtxMenu(null);

  const copyText = useCallback(async (text: string) => {
    const s = String(text ?? '');
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(s);
        return;
      }
    } catch {
      // fall back to IPC
    }
    try {
      await window.electronAPI?.clipboardWriteText?.(s);
    } catch {
      /* ignore */
    }
  }, []);

  const reveal = useCallback(async (rel: string) => {
    try {
      await window.electronAPI?.workspaceRevealInExplorer?.(rel);
    } finally {
      closeCtxMenu();
    }
  }, []);

  const refreshTree = useCallback(() => {
    window.dispatchEvent(new CustomEvent('cf-workspace-files-updated'));
  }, []);

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
      refreshTree();
    },
    [refreshTree, t]
  );

  const onExternalDragOver = useCallback((e: DragEvent) => {
    if (!hasFileDrag(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const handleExternalDrop = useCallback(
    async (targetRelativeDir: string, e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setFileDragOver(false);
      if (!hasFileDrag(e)) return;
      await runExternalImport(targetRelativeDir, e.dataTransfer);
    },
    [runExternalImport]
  );

  const onTreeDragEnter = useCallback((e: DragEvent) => {
    if (!hasFileDrag(e)) return;
    setFileDragOver(true);
  }, []);

  const onTreeDragLeave = useCallback((e: DragEvent) => {
    if (!hasFileDrag(e)) return;
    const cur = e.currentTarget;
    const rel = e.relatedTarget;
    if (rel && cur instanceof Node && cur.contains(rel as Node)) return;
    setFileDragOver(false);
  }, []);

  const runNewDir = useCallback(
    async (baseRel: string, name: string) => {
      const rel = joinRel(baseRel, name);
      const res = await window.electronAPI?.workspaceMkdir?.(rel);
      if (!res?.ok) throw new Error(res?.error || 'mkdir failed');
      refreshTree();
    },
    [refreshTree]
  );

  const runNewFile = useCallback(
    async (baseRel: string, name: string) => {
      const rel = joinRel(baseRel, name);
      const res = await window.electronAPI?.workspaceWriteTextFile?.({ relativePath: rel, content: '', overwrite: false });
      if (!res?.ok) throw new Error(res?.error || 'write failed');
      refreshTree();
      setSelectedFile(rel);
    },
    [refreshTree]
  );

  const runRename = useCallback(
    async (fromRel: string, toName: string) => {
      const parent = fromRel.replace(/\\/g, '/').split('/').slice(0, -1).join('/');
      const toRel = joinRel(parent, toName);
      const res = await window.electronAPI?.workspaceRenamePath?.({ from: fromRel, to: toRel, overwrite: false });
      if (!res?.ok) throw new Error(res?.error || 'rename failed');
      refreshTree();
      if (selectedFile === fromRel) setSelectedFile(toRel);
    },
    [refreshTree, selectedFile]
  );

  const runDelete = useCallback(
    async (rel: string) => {
      const res = await window.electronAPI?.workspaceDeletePath?.(rel);
      if (!res?.ok) throw new Error(res?.error || 'delete failed');
      refreshTree();
      if (selectedFile === rel) {
        setSelectedFile(null);
        setPreview({ state: 'idle' });
      }
    },
    [refreshTree, selectedFile]
  );

  const expandedRef = useRef<Set<string>>(expanded);
  useEffect(() => {
    expandedRef.current = expanded;
  }, [expanded]);

  useEffect(() => {
    setExpanded(new Set(['']));
    setChildren(new Map());
    setErrors(new Map());
    setSelectedFile(null);
    setPreview({ state: 'idle' });
    if (workspacePath) {
      void loadDir('');
    }
  }, [workspacePath, loadDir]);

  useEffect(() => {
    if (!workspacePath) return;
    let timer: number | null = null;
    const onFilesUpdated = () => {
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        // Refresh root and all currently expanded dirs.
        const dirs = Array.from(expandedRef.current.values());
        if (!dirs.includes('')) dirs.unshift('');
        for (const d of dirs) void loadDir(d);
      }, 120);
    };
    window.addEventListener('cf-workspace-files-updated', onFilesUpdated as any);
    return () => {
      if (timer) window.clearTimeout(timer);
      window.removeEventListener('cf-workspace-files-updated', onFilesUpdated as any);
    };
  }, [workspacePath, loadDir]);

  useEffect(() => {
    setMdViewMode('preview');
  }, [selectedFile]);

  useLayoutEffect(() => {
    const el = splitRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSplitInnerW(el.clientWidth));
    ro.observe(el);
    setSplitInnerW(el.clientWidth);
    return () => ro.disconnect();
  }, [workspacePath]);

  useEffect(() => {
    try {
      localStorage.setItem(TREE_SPLIT_RATIO_KEY, String(treeSplitRatio));
    } catch {
      /* ignore */
    }
  }, [treeSplitRatio]);

  const treeColMaxPx =
    splitInnerW > 0
      ? Math.max(TREE_COL_MIN_PX, splitInnerW - TREE_PREVIEW_GUTTER_PX - PREVIEW_COL_MIN_PX)
      : TREE_COL_MIN_PX;
  const treeColPx =
    splitInnerW > 0
      ? clampWidth(Math.round(splitInnerW * treeSplitRatio), TREE_COL_MIN_PX, treeColMaxPx)
      : TREE_COL_MIN_PX;

  const onTreePreviewGutterDown = (e: MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    const split = splitRef.current;
    if (!split) return;
    const sw = split.clientWidth;
    const maxT = Math.max(TREE_COL_MIN_PX, sw - TREE_PREVIEW_GUTTER_PX - PREVIEW_COL_MIN_PX);
    const startW = clampWidth(Math.round(sw * treeSplitRatio), TREE_COL_MIN_PX, maxT);
    startShellColumnDrag(
      e.clientX,
      startW,
      (w) => {
        const sw2 = splitRef.current?.clientWidth ?? sw;
        const maxT2 = Math.max(TREE_COL_MIN_PX, sw2 - TREE_PREVIEW_GUTTER_PX - PREVIEW_COL_MIN_PX);
        const cw = clampWidth(w, TREE_COL_MIN_PX, maxT2);
        setTreeSplitRatio(cw / sw2);
      },
      TREE_COL_MIN_PX,
      maxT,
      false
    );
  };

  const toggleDir = (rel: string) => {
    setExpanded((prev) => {
      const n = new Set(prev);
      if (n.has(rel)) n.delete(rel);
      else n.add(rel);
      return n;
    });
    if (!children.has(rel) && !loading.has(rel)) {
      void loadDir(rel);
    }
  };

  useEffect(() => {
    if (!selectedFile || !workspacePath) {
      setPreview({ state: 'idle' });
      return;
    }
    let cancelled = false;
    setPreview({ state: 'loading' });
    void (async () => {
      try {
        const res = await window.electronAPI?.workspaceReadFilePreview?.(selectedFile);
        if (cancelled) return;
        if (!res) {
          setPreview({ state: 'error', message: t('chat.rightTabs.previewNoApi') });
          return;
        }
        if (!res.ok) {
          setPreview({
            state: 'error',
            message:
              res.error === 'IMAGE_PREVIEW_TOO_LARGE'
                ? t('chat.rightTabs.previewImageTooLarge', { maxMB: WORKSPACE_IMAGE_PREVIEW_MAX_MB })
                : res.error,
          });
          return;
        }
        if (res.isImage && res.mimeType) {
          setPreview({
            state: 'image',
            dataUrl: `data:${res.mimeType};base64,${res.content}`,
          });
          return;
        }
        if (res.isPdf && res.mimeType) {
          setPreview({
            state: 'pdf',
            pdfBase64: res.content,
            textExtract: res.textExtract ?? '',
            truncated: res.truncated,
            numpages: res.numpages,
          });
          return;
        }
        if (res.isBinary) {
          setPreview({ state: 'binary' });
          return;
        }
        setPreview({ state: 'text', content: res.content, truncated: res.truncated });
      } catch (e: unknown) {
        if (!cancelled) {
          setPreview({ state: 'error', message: e instanceof Error ? e.message : String(e) });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedFile, workspacePath, t]);

  const csvPreviewModel = useMemo(() => {
    if (preview.state !== 'text') return null;
    if (!selectedFile || !isCsvFilename(selectedFile)) return null;
    return parseCsvForPreview(preview.content);
  }, [preview, selectedFile]);

  const treeNodes = useMemo(() => {
    if (!workspacePath) return null;

    const renderDir = (rel: string, depth: number): ReactElement[] => {
      const ents = children.get(rel);
      const err = errors.get(rel);
      const isLoading = loading.has(rel);
      const isOpen = expanded.has(rel);

      if (rel !== '' && !isOpen) return [];

      const rows: ReactElement[] = [];
      if (rel === '') {
        rows.push(
          <div
            key="__root"
            className="cf-fileTree__rootLabel"
            onDragOver={onExternalDragOver}
            onDrop={(e) => void handleExternalDrop('', e)}
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setCtxMenu({ x: e.clientX, y: e.clientY, target: { kind: 'root' } });
            }}
          >
            {t('chat.rightTabs.treeRoot')}
          </div>
        );
      }

      if (err) {
        rows.push(
          <div key={`${rel}__err`} className="cf-fileTree__err" style={{ paddingLeft: 8 + depth * 12 }}>
            {err}
          </div>
        );
        return rows;
      }

      if (ents == null && isLoading) {
        rows.push(
          <div key={`${rel}__loading`} className="cf-sub" style={{ paddingLeft: 8 + depth * 12 }}>
            {t('chat.rightTabs.treeLoading')}
          </div>
        );
        return rows;
      }

      if (!ents) return rows;

      for (const e of ents) {
        const childRel = joinRel(rel, e.name);
        if (e.kind === 'dir') {
          const open = expanded.has(childRel);
          rows.push(
            <button
              key={childRel}
              type="button"
              className={`cf-fileTree__row cf-fileTree__row--dir ${open ? 'cf-fileTree__row--open' : ''}`}
              style={{ paddingLeft: 8 + depth * 12 }}
              onClick={() => toggleDir(childRel)}
              onDragOver={onExternalDragOver}
              onDrop={(ev) => void handleExternalDrop(childRel, ev)}
              onContextMenu={(ev) => {
                ev.preventDefault();
                ev.stopPropagation();
                setCtxMenu({ x: ev.clientX, y: ev.clientY, target: { kind: 'dir', rel: childRel } });
              }}
            >
              <span className="cf-fileTree__chev">{open ? '▾' : '▸'}</span>
              <span className="cf-fileTree__name">{e.name}</span>
            </button>
          );
          if (open) {
            rows.push(...renderDir(childRel, depth + 1));
          }
        } else {
          const active = selectedFile === childRel;
          rows.push(
            <button
              key={childRel}
              type="button"
              className={`cf-fileTree__row cf-fileTree__row--file ${active ? 'cf-fileTree__row--active' : ''}`}
              style={{ paddingLeft: 8 + depth * 12 }}
              onClick={() => setSelectedFile(childRel)}
              onDragOver={onExternalDragOver}
              onDrop={(ev) => void handleExternalDrop(rel, ev)}
              onContextMenu={(ev) => {
                ev.preventDefault();
                ev.stopPropagation();
                setCtxMenu({ x: ev.clientX, y: ev.clientY, target: { kind: 'file', rel: childRel } });
              }}
            >
              <span className="cf-fileTree__chev" />
              <span className="cf-fileTree__name">{e.name}</span>
            </button>
          );
        }
      }
      return rows;
    };

    return renderDir('', 0);
  }, [
    workspacePath,
    children,
    expanded,
    errors,
    loading,
    selectedFile,
    t,
    toggleDir,
    handleExternalDrop,
    onExternalDragOver,
  ]);

  if (!workspacePath) {
    return <div className="cf-sub">{t('chat.rightTabs.noWorkspaceForTree')}</div>;
  }

  const showMdToggle =
    selectedFile != null && isMarkdownFilename(selectedFile) && preview.state === 'text';

  const previewTitleSuffix = selectedFile ? ` · ${selectedFile}` : '';

  return (
    <div className="cf-rightWorkspace">
      <div className="cf-rightWorkspace__path cf-sub" title={workspacePath}>
        {workspacePath}
      </div>
      <div className="cf-rightWorkspace__split" ref={splitRef}>
        <div
          className="cf-rightWorkspace__col cf-rightWorkspace__col--tree"
          style={{ flex: 'none', width: treeColPx, minWidth: 0 }}
        >
          <div className="cf-rightWorkspace__colTitle">{t('chat.rightTabs.treeTitle')}</div>
          <div
            className={`cf-fileTree${fileDragOver ? ' cf-fileTree--dragOver' : ''}`}
            role="tree"
            onDragEnter={onTreeDragEnter}
            onDragLeave={onTreeDragLeave}
            onDragOver={onExternalDragOver}
            onDrop={(e) => void handleExternalDrop('', e)}
            onContextMenu={(e) => {
              // Right-click on blank area of tree should open root menu (new file/folder).
              // If the event originated from a file/dir row (or root label), let the row handler handle it.
              const targetEl = e.target as HTMLElement | null;
              if (targetEl?.closest?.('.cf-fileTree__row, .cf-fileTree__rootLabel')) {
                return;
              }
              e.preventDefault();
              setCtxMenu({ x: e.clientX, y: e.clientY, target: { kind: 'root' } });
            }}
          >
            {treeNodes}
          </div>
        </div>
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label={t('layout.resizeWorkspaceSplit')}
          className="cf-rightWorkspace__gutter cf-shell__gutter"
          onMouseDown={onTreePreviewGutterDown}
        />
        <div className="cf-rightWorkspace__col cf-rightWorkspace__col--preview">
          <div
            className={
              showMdToggle
                ? 'cf-rightWorkspace__colTitle cf-rightWorkspace__colTitle--previewHead'
                : 'cf-rightWorkspace__colTitle'
            }
          >
            <span>
              {t('chat.rightTabs.previewTitle')}
              {previewTitleSuffix ? <span className="cf-sub"> {previewTitleSuffix}</span> : null}
            </span>
            {showMdToggle ? (
              <div className="cf-filePreview__mdToggle" role="group" aria-label={t('chat.rightTabs.mdModeGroup')}>
                <button
                  type="button"
                  className={
                    mdViewMode === 'preview'
                      ? 'cf-btn cf-btnGhost cf-btnSmall cf-filePreview__mdBtn--active'
                      : 'cf-btn cf-btnGhost cf-btnSmall'
                  }
                  onClick={() => setMdViewMode('preview')}
                >
                  {t('chat.rightTabs.mdPreview')}
                </button>
                <button
                  type="button"
                  className={
                    mdViewMode === 'source'
                      ? 'cf-btn cf-btnGhost cf-btnSmall cf-filePreview__mdBtn--active'
                      : 'cf-btn cf-btnGhost cf-btnSmall'
                  }
                  onClick={() => setMdViewMode('source')}
                >
                  {t('chat.rightTabs.mdSource')}
                </button>
              </div>
            ) : null}
          </div>
          <div className="cf-filePreview">
            <div className="cf-filePreview__scroll">
              {!selectedFile ? (
                <div className="cf-sub">{t('chat.rightTabs.previewEmpty')}</div>
              ) : preview.state === 'loading' ? (
                <div className="cf-sub">{t('chat.rightTabs.previewLoading')}</div>
              ) : preview.state === 'error' ? (
                <div className="cf-errorText">{preview.message}</div>
              ) : preview.state === 'binary' ? (
                <div className="cf-sub">{t('chat.rightTabs.previewBinary')}</div>
              ) : preview.state === 'image' ? (
                <>
                  <div className="cf-filePreview__imgWrap">
                    <img className="cf-filePreview__img" src={preview.dataUrl} alt="" decoding="async" />
                  </div>
                </>
              ) : preview.state === 'pdf' ? (
                <>
                  {preview.truncated ? (
                    <div className="cf-filePreview__warn cf-sub">{t('chat.rightTabs.previewTruncated')}</div>
                  ) : null}
                  {typeof preview.numpages === 'number' && preview.numpages > 0 ? (
                    <div className="cf-sub cf-filePreview__pdfMeta">
                      {t('chat.rightTabs.previewPdfPages', { n: preview.numpages })}
                    </div>
                  ) : null}
                  <div className="cf-filePreview__pdfWrap cf-filePreview__pdfWrap--canvas">
                    <FilePreviewPdfCanvas pdfBase64={preview.pdfBase64} />
                  </div>
                  {preview.textExtract.trim().length > 0 ? (
                    <details className="cf-filePreview__pdfDetails">
                      <summary>{t('chat.rightTabs.previewPdfExtractedText')}</summary>
                      <pre className="cf-filePreview__pre cf-filePreview__pre--pdfText">{preview.textExtract}</pre>
                    </details>
                  ) : (
                    <div className="cf-sub cf-filePreview__pdfNoText">{t('chat.rightTabs.previewPdfNoTextLayer')}</div>
                  )}
                </>
              ) : preview.state === 'text' ? (
                <>
                  {csvPreviewModel?.ok ? (
                    <CsvPreviewTable model={csvPreviewModel} fileTruncated={preview.truncated} t={t} />
                  ) : (
                    <>
                      {preview.truncated ? (
                        <div className="cf-filePreview__warn cf-sub">{t('chat.rightTabs.previewTruncated')}</div>
                      ) : null}
                      {selectedFile && isMarkdownFilename(selectedFile) && mdViewMode === 'preview' ? (
                        <div className="cf-filePreview__mdBody cf-msgItem__content">
                          <Markdown options={markdownOptions}>{preview.content}</Markdown>
                        </div>
                      ) : (
                        <pre className="cf-filePreview__pre">{preview.content}</pre>
                      )}
                    </>
                  )}
                </>
              ) : (
                <div className="cf-sub">{t('chat.rightTabs.previewEmpty')}</div>
              )}
            </div>
          </div>
        </div>
      </div>

      {ctxMenu ? (
        <div
          className="cf-ctxMenu__backdrop"
          onMouseDown={() => closeCtxMenu()}
          onContextMenu={(e) => {
            e.preventDefault();
            closeCtxMenu();
          }}
        >
          <div
            className="cf-ctxMenu"
            style={{ left: ctxMenu.x, top: ctxMenu.y }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            {ctxMenu.target.kind !== 'root' ? (
              <button
                className="cf-ctxMenu__item"
                type="button"
                onClick={() => {
                  const rel = targetRel(ctxMenu.target);
                  if (rel) void reveal(rel);
                }}
              >
                在文件资源管理器中显示
              </button>
            ) : null}

            {ctxMenu.target.kind === 'root' || ctxMenu.target.kind === 'dir' ? (
              <>
                <button
                  className="cf-ctxMenu__item"
                  type="button"
                  onClick={() => {
                    const baseRel = ctxMenu.target.kind === 'dir' ? ctxMenu.target.rel : '';
                    setDialog({ kind: 'newFile', baseRel, initialName: 'new-file.txt', target: ctxMenu.target });
                    closeCtxMenu();
                  }}
                >
                  新建文件
                </button>
                <button
                  className="cf-ctxMenu__item"
                  type="button"
                  onClick={() => {
                    const baseRel = ctxMenu.target.kind === 'dir' ? ctxMenu.target.rel : '';
                    setDialog({ kind: 'newDir', baseRel, initialName: 'new-folder', target: ctxMenu.target });
                    closeCtxMenu();
                  }}
                >
                  新建文件夹
                </button>
                <div className="cf-ctxMenu__sep" />
              </>
            ) : null}

            {ctxMenu.target.kind !== 'root' ? (
              <>
                <button
                  className="cf-ctxMenu__item"
                  type="button"
                  onClick={async () => {
                    const rel = targetRel(ctxMenu.target);
                    if (!rel) return;
                    const abs = await window.electronAPI?.workspaceResolveAbsolutePath?.(rel);
                    void copyText(abs?.absolutePath ?? rel);
                    closeCtxMenu();
                  }}
                >
                  复制路径
                </button>
                <button
                  className="cf-ctxMenu__item"
                  type="button"
                  onClick={() => {
                    const rel = targetRel(ctxMenu.target);
                    if (rel) void copyText(rel);
                    closeCtxMenu();
                  }}
                >
                  复制相对路径
                </button>
                <div className="cf-ctxMenu__sep" />
                <button
                  className="cf-ctxMenu__item"
                  type="button"
                  onClick={() => {
                    const rel = targetRel(ctxMenu.target);
                    if (!rel) return;
                    const base = rel.replace(/\\/g, '/').split('/').pop() ?? rel;
                    setDialog({ kind: 'rename', baseRel: rel, initialName: base, target: ctxMenu.target });
                    closeCtxMenu();
                  }}
                >
                  重命名
                </button>
                <button
                  className="cf-ctxMenu__item cf-ctxMenu__item--danger"
                  type="button"
                  onClick={() => {
                    const rel = targetRel(ctxMenu.target);
                    if (!rel) return;
                    setDialog({ kind: 'delete', baseRel: rel, initialName: '', target: ctxMenu.target });
                    closeCtxMenu();
                  }}
                >
                  删除
                </button>
              </>
            ) : null}
          </div>
        </div>
      ) : null}

      {dialog ? (
        <InlineDialog
          dialog={dialog}
          onClose={() => setDialog(null)}
          onSubmit={async (name) => {
            const d = dialog;
            if (!workspacePath) return;
            if (d.kind === 'newFile') return await runNewFile(d.baseRel, name);
            if (d.kind === 'newDir') return await runNewDir(d.baseRel, name);
            if (d.kind === 'rename') return await runRename(d.baseRel, name);
            if (d.kind === 'delete') return await runDelete(d.baseRel);
          }}
        />
      ) : null}
    </div>
  );
};

export default WorkspaceFilesSplit;

const InlineDialog: FC<{
  dialog: { kind: 'newFile' | 'newDir' | 'rename' | 'delete'; baseRel: string; initialName: string };
  onClose: () => void;
  onSubmit: (name: string) => Promise<void> | void;
}> = ({ dialog, onClose, onSubmit }) => {
  const [val, setVal] = useState(dialog.initialName);
  const [err, setErr] = useState<string | null>(null);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    setVal(dialog.initialName);
    setErr(null);
    setTimeout(() => ref.current?.focus(), 0);
  }, [dialog.initialName]);

  const title =
    dialog.kind === 'newFile'
      ? '新建文件'
      : dialog.kind === 'newDir'
        ? '新建文件夹'
        : dialog.kind === 'rename'
          ? '重命名'
          : '删除';

  return (
    <div className="cf-ctxDialog__backdrop" onMouseDown={onClose}>
      <div className="cf-ctxDialog" onMouseDown={(e) => e.stopPropagation()}>
        <div className="cf-ctxDialog__title">{title}</div>
        {dialog.kind === 'delete' ? (
          <div className="cf-sub" style={{ marginBottom: 12 }}>
            确认删除：<code>{dialog.baseRel}</code>
          </div>
        ) : (
          <input
            ref={ref}
            className="cf-input"
            value={val}
            onChange={(e) => setVal(e.target.value)}
            onKeyDown={async (e) => {
              if (e.key === 'Escape') onClose();
              if (e.key === 'Enter') {
                try {
                  setErr(null);
                  await onSubmit(val.trim());
                  onClose();
                } catch (ex: any) {
                  setErr(ex?.message ?? String(ex));
                }
              }
            }}
          />
        )}
        {err ? <div className="cf-errorText" style={{ marginTop: 8 }}>{err}</div> : null}
        <div className="cf-ctxDialog__actions">
          <button className="cf-btn cf-btnGhost cf-btnSmall" type="button" onClick={onClose}>
            取消
          </button>
          <button
            className={dialog.kind === 'delete' ? 'cf-btn cf-btnDanger cf-btnSmall' : 'cf-btn cf-btnPrimary cf-btnSmall'}
            type="button"
            onClick={async () => {
              try {
                setErr(null);
                await onSubmit(val.trim());
                onClose();
              } catch (ex: any) {
                setErr(ex?.message ?? String(ex));
              }
            }}
          >
            {dialog.kind === 'delete' ? '删除' : '确定'}
          </button>
        </div>
      </div>
    </div>
  );
};
