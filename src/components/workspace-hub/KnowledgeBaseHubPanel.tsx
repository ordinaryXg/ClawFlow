import { FC, useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import './WorkspaceHubPanels.css';

type ManifestEntry = {
  path: string;
  ext: string;
  sizeBytes: number;
  mtimeMs: number;
  title: string | null;
  abstract: string | null;
};

type MemoryHit = {
  source_kind: string;
  source_path: string;
  abstract?: string | null;
  snippet: string;
};

type Props = {
  workspacePath: string | null;
};

const KnowledgeBaseHubPanel: FC<Props> = ({ workspacePath }) => {
  const { t } = useTranslation();
  const [entries, setEntries] = useState<ManifestEntry[]>([]);
  const [listBusy, setListBusy] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchBusy, setSearchBusy] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [hits, setHits] = useState<MemoryHit[]>([]);
  const [newTitle, setNewTitle] = useState('');
  const [createBusy, setCreateBusy] = useState(false);
  const [rebuildBusy, setRebuildBusy] = useState(false);
  const [ingestPath, setIngestPath] = useState('');
  const [ingestBusy, setIngestBusy] = useState(false);

  const knowledgeOnly = useMemo(
    () =>
      entries.filter((e) => {
        const p = e.path.replace(/\\/g, '/');
        return (
          p.includes('.agent/.knowledge/') ||
          p.includes('.agent/knowledge/') ||
          p.includes('.agent/.clawflow/knowledge-ingest/')
        );
      }),
    [entries]
  );

  const loadManifest = useCallback(
    async (refresh?: boolean) => {
      if (!workspacePath?.trim()) {
        setEntries([]);
        return;
      }
      setListBusy(true);
      setListError(null);
      try {
        const res = await window.electronAPI?.knowledgeListManifest?.({ refresh });
        if (!res?.ok) {
          setEntries([]);
          setListError(String((res as { error?: string })?.error ?? t('chat.workspaceHub.kbLoadFail')));
          return;
        }
        setEntries(res.entries ?? []);
      } catch (e: unknown) {
        setEntries([]);
        setListError(e instanceof Error ? e.message : String(e));
      } finally {
        setListBusy(false);
      }
    },
    [workspacePath, t]
  );

  useEffect(() => {
    void loadManifest(true);
  }, [loadManifest]);

  const onSearch = async () => {
    const q = searchQuery.trim();
    if (!q) return;
    if (!workspacePath?.trim()) {
      setSearchError(t('settings.noWorkspaceSelected'));
      return;
    }
    setSearchBusy(true);
    setSearchError(null);
    try {
      const res = await window.electronAPI?.memoryFtsSearch?.({ query: q, limit: 16 });
      if (!res?.ok) {
        setHits([]);
        setSearchError(String((res as { error?: string })?.error ?? t('chat.workspaceHub.kbSearchFail')));
        return;
      }
      setHits((res.hits ?? []) as MemoryHit[]);
    } catch (e: unknown) {
      setHits([]);
      setSearchError(e instanceof Error ? e.message : String(e));
    } finally {
      setSearchBusy(false);
    }
  };

  const onCreateNote = async () => {
    const title = newTitle.trim();
    if (!title || !workspacePath?.trim()) return;
    setCreateBusy(true);
    try {
      const res = await window.electronAPI?.knowledgeCreateNote?.({ title, subdir: 'notes' });
      if (!res?.ok) {
        const err = (res as { error?: string })?.error;
        (window as unknown as { __cf_toast?: { error?: (a: string, b?: string) => void } }).__cf_toast?.error?.(
          t('chat.workspaceHub.kbCreateFail'),
          err === 'file_exists' ? t('chat.workspaceHub.kbCreateExists') : err
        );
        return;
      }
      setNewTitle('');
      (window as unknown as { __cf_toast?: { success?: (a: string, b?: string) => void } }).__cf_toast?.success?.(
        t('chat.workspaceHub.kbCreateOk'),
        res.relativePath
      );
      await loadManifest(true);
    } finally {
      setCreateBusy(false);
    }
  };

  const onIngest = async () => {
    const rel = ingestPath.trim();
    if (!rel || !workspacePath?.trim()) return;
    setIngestBusy(true);
    try {
      const res = await window.electronAPI?.knowledgeIngestFile?.(rel);
      if (!res?.ok) {
        const err = (res as { error?: string })?.error;
        (window as unknown as { __cf_toast?: { error?: (a: string, b?: string) => void } }).__cf_toast?.error?.(
          t('chat.workspaceHub.kbIngestFail'),
          err
        );
        return;
      }
      (window as unknown as { __cf_toast?: { success?: (a: string, b?: string) => void } }).__cf_toast?.success?.(
        t('chat.workspaceHub.kbIngestOk'),
        res.ingestRelPath
      );
      setIngestPath('');
      await loadManifest(true);
    } finally {
      setIngestBusy(false);
    }
  };

  const onRebuild = async () => {
    if (!workspacePath?.trim()) return;
    setRebuildBusy(true);
    try {
      const res = await window.electronAPI?.memoryFtsRebuild?.();
      if (!res?.ok) {
        throw new Error(String((res as { error?: string })?.error ?? 'rebuild_failed'));
      }
      (window as unknown as { __cf_toast?: { success?: (a: string, b?: string) => void } }).__cf_toast?.success?.(
        t('chat.workspaceHub.kbRebuildOk'),
        t('chat.workspaceHub.kbRebuildOkBody', { indexed: res.indexed, pruned: res.pruned })
      );
      await loadManifest(true);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      (window as unknown as { __cf_toast?: { error?: (a: string, b?: string) => void } }).__cf_toast?.error?.(
        t('chat.workspaceHub.kbRebuildFail'),
        msg
      );
    } finally {
      setRebuildBusy(false);
    }
  };

  const noWs = !workspacePath?.trim();

  const kindBadge = (kind: string) => {
    if (kind === 'knowledge_ingest_md') return t('chat.workspaceHub.kbTagIngest');
    if (kind === 'conversation_summary') return t('chat.workspaceHub.kbTagChat');
    if (kind === 'knowledge_md' || kind === 'knowledge_txt') return t('chat.workspaceHub.kbTagKnowledge');
    if (kind === 'hermes_memory' || kind === 'memory_md') return t('chat.workspaceHub.kbTagMemory');
    if (kind.startsWith('skill')) return t('chat.workspaceHub.kbTagSkill');
    return kind;
  };

  return (
    <div className="cf-hubPage">
      <div className="cf-hubPage__toolbar">
        <HubToolbarHeader title={t('chat.workspaceHub.kbTitle')} hint={t('chat.workspaceHub.kbHint')} noWs={noWs} />
      </div>
      <div className="cf-hubPage__scroll">
        <div className="cf-hubCard">
          <h3 className="cf-hubPage__title" style={{ marginBottom: 8 }}>
            {t('chat.workspaceHub.kbSearchTitle')}
          </h3>
          <div className="cf-hubKbToolbar">
            <input
              className="cf-input"
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void onSearch();
              }}
              placeholder={t('chat.workspaceHub.kbSearchPlaceholder')}
              disabled={noWs || searchBusy}
            />
            <button
              type="button"
              className="cf-btn cf-btnPrimary cf-btnSmall"
              disabled={noWs || searchBusy || !searchQuery.trim()}
              onClick={() => void onSearch()}
            >
              {searchBusy ? t('chat.workspaceHub.kbSearching') : t('chat.workspaceHub.kbSearchBtn')}
            </button>
            <button
              type="button"
              className="cf-btn cf-btnGhost cf-btnSmall"
              disabled={noWs || rebuildBusy}
              onClick={() => void onRebuild()}
            >
              {rebuildBusy ? t('chat.workspaceHub.kbRebuilding') : t('chat.workspaceHub.kbRebuildBtn')}
            </button>
          </div>
          {searchError ? <div className="cf-hubKbError">{searchError}</div> : null}
          {hits.length > 0 ? (
            <ul className="cf-hubKbHitList">
              {hits.map((h) => (
                <li key={`${h.source_kind}:${h.source_path}`} className="cf-hubKbHit">
                  <div className="cf-hubKbHit__meta">
                    <span className="cf-hubKbHit__tag">{kindBadge(h.source_kind)}</span>
                    <code className="cf-hubKbHit__path">{h.source_path}</code>
                  </div>
                  {h.abstract ? <div className="cf-hubKbHit__abstract">{h.abstract}</div> : null}
                  <pre className="cf-hubKbHit__snippet">{h.snippet}</pre>
                </li>
              ))}
            </ul>
          ) : null}
          {!searchBusy && searchQuery.trim() && !searchError && hits.length === 0 ? (
            <p className="cf-sub">{t('chat.workspaceHub.kbSearchEmpty')}</p>
          ) : null}
        </div>

        <div className="cf-hubCard">
          <h3 className="cf-hubPage__title" style={{ marginBottom: 8 }}>
            {t('chat.workspaceHub.kbCreateTitle')}
          </h3>
          <div className="cf-hubKbToolbar">
            <input
              className="cf-input"
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder={t('chat.workspaceHub.kbCreatePlaceholder')}
              disabled={noWs || createBusy}
            />
            <button
              type="button"
              className="cf-btn cf-btnPrimary cf-btnSmall"
              disabled={noWs || createBusy || !newTitle.trim()}
              onClick={() => void onCreateNote()}
            >
              {createBusy ? t('chat.workspaceHub.kbCreating') : t('chat.workspaceHub.kbCreateBtn')}
            </button>
          </div>
          <p className="cf-sub" style={{ marginTop: 8 }}>
            {t('chat.workspaceHub.kbCreateHint')}
          </p>
        </div>

        <div className="cf-hubCard">
          <h3 className="cf-hubPage__title" style={{ marginBottom: 8 }}>
            {t('chat.workspaceHub.kbIngestTitle')}
          </h3>
          <div className="cf-hubKbToolbar">
            <input
              className="cf-input"
              type="text"
              value={ingestPath}
              onChange={(e) => setIngestPath(e.target.value)}
              placeholder={t('chat.workspaceHub.kbIngestPlaceholder')}
              disabled={noWs || ingestBusy}
            />
            <button
              type="button"
              className="cf-btn cf-btnPrimary cf-btnSmall"
              disabled={noWs || ingestBusy || !ingestPath.trim()}
              onClick={() => void onIngest()}
            >
              {ingestBusy ? t('chat.workspaceHub.kbIngesting') : t('chat.workspaceHub.kbIngestBtn')}
            </button>
          </div>
          <p className="cf-sub" style={{ marginTop: 8 }}>
            {t('chat.workspaceHub.kbIngestHint')}
          </p>
        </div>

        <div className="cf-hubCard">
          <h3 className="cf-hubPage__title" style={{ marginBottom: 8 }}>
            {t('chat.workspaceHub.kbFilesTitle')}
          </h3>
          <div className="cf-hubKbToolbar">
            <button
              type="button"
              className="cf-btn cf-btnGhost cf-btnSmall"
              disabled={noWs || listBusy}
              onClick={() => void loadManifest(true)}
            >
              {listBusy ? t('chat.workspaceHub.kbRefreshing') : t('chat.workspaceHub.kbRefreshBtn')}
            </button>
            <span className="cf-sub">{t('chat.workspaceHub.kbManifestPath')}</span>
          </div>
          {listError ? <div className="cf-hubKbError">{listError}</div> : null}
          {knowledgeOnly.length === 0 && !listBusy && !listError ? (
            <p className="cf-sub">{t('chat.workspaceHub.kbFilesEmpty')}</p>
          ) : (
            <ul className="cf-hubKbFileList">
              {knowledgeOnly.map((e) => (
                <li key={e.path} className="cf-hubKbFile">
                  <div className="cf-hubKbFile__title">{e.title ?? e.path}</div>
                  <code className="cf-hubKbFile__path">{e.path}</code>
                  {e.abstract ? <div className="cf-hubKbFile__abstract">{e.abstract}</div> : null}
                  <div className="cf-sub">
                    {new Date(e.mtimeMs).toLocaleString()} · {(e.sizeBytes / 1024).toFixed(1)} KB
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
};

function HubToolbarHeader({ title, hint, noWs }: { title: string; hint: string; noWs: boolean }) {
  const { t } = useTranslation();
  return (
    <>
      <div className="cf-hubPage__titleRow">
        <h2 className="cf-hubPage__title">{title}</h2>
      </div>
      <p className="cf-sub" style={{ margin: '8px 0 0', fontSize: 12 }}>
        {hint}
      </p>
      {noWs ? <p className="cf-sub" style={{ marginTop: 8 }}>{t('settings.noWorkspaceSelected')}</p> : null}
    </>
  );
}

export default KnowledgeBaseHubPanel;
