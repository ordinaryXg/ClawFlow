import {
  FC,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type ReactElement,
} from 'react';
import { useTranslation } from 'react-i18next';
import Markdown from 'markdown-to-jsx';
import hljs from 'highlight.js';
import 'highlight.js/styles/github-dark.css';
import { clampWidth, startShellColumnDrag } from '../../hooks/usePersistedShellWidth';
import { WORKSPACE_IMAGE_PREVIEW_MAX_MB } from '../../workspace-preview-limits';
import './chat.css';

type Entry = { name: string; kind: 'file' | 'dir' };

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

function isMarkdownFilename(rel: string): boolean {
  const base = rel.replace(/\\/g, '/').split('/').pop()?.toLowerCase() ?? '';
  return base.endsWith('.md') || base.endsWith('.markdown');
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
    | { state: 'binary' }
    | { state: 'error'; message: string }
  >({ state: 'idle' });
  const [mdViewMode, setMdViewMode] = useState<'preview' | 'source'>('preview');

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
          <div key="__root" className="cf-fileTree__rootLabel">
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
  }, [workspacePath, children, expanded, errors, loading, selectedFile, t]);

  if (!workspacePath) {
    return <div className="cf-sub">{t('chat.rightTabs.noWorkspaceForTree')}</div>;
  }

  const showMdToggle =
    selectedFile != null && isMarkdownFilename(selectedFile) && preview.state === 'text';

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
          <div className="cf-fileTree" role="tree">
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
            <span>{t('chat.rightTabs.previewTitle')}</span>
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
                <div className="cf-filePreview__path cf-sub">{selectedFile}</div>
                <div className="cf-filePreview__imgWrap">
                  <img className="cf-filePreview__img" src={preview.dataUrl} alt="" decoding="async" />
                </div>
              </>
            ) : preview.state === 'text' ? (
              <>
                <div className="cf-filePreview__path cf-sub">{selectedFile}</div>
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
            ) : (
              <div className="cf-sub">{t('chat.rightTabs.previewEmpty')}</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default WorkspaceFilesSplit;
