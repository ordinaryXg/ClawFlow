import { FC, useCallback, useEffect, useState } from 'react';
import { Checkbox } from 'antd';
import { useTranslation } from 'react-i18next';
import { useWorkspaceStore } from '../../store/modules/workspaceStore';
import {
  DEFAULT_WORKSPACE_TOOL_SELECTION,
  type WorkspaceToolId,
} from '../../shared/workspace-tools';

type MemoryHit = {
  id: number;
  source_kind: string;
  source_path: string;
  skill_name: string | null;
  title: string | null;
  abstract?: string | null;
  overview?: string | null;
  snippet: string;
  rank: number;
};

const MemorySettingsPanel: FC = () => {
  const { t } = useTranslation();
  const activeWorkspacePath = useWorkspaceStore((s) => s.activePath);

  const [toolsSel, setToolsSel] = useState<Record<WorkspaceToolId, boolean>>({
    ...DEFAULT_WORKSPACE_TOOL_SELECTION,
  });
  const [toolsSaving, setToolsSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchBusy, setSearchBusy] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [hits, setHits] = useState<MemoryHit[]>([]);
  const [rebuildBusy, setRebuildBusy] = useState(false);
  const [lastRebuild, setLastRebuild] = useState<{ indexed: number; pruned: number } | null>(null);
  const [embEnabled, setEmbEnabled] = useState(false);
  const [embProvider, setEmbProvider] = useState<'ollama' | 'openai'>('ollama');
  const [embBaseUrl, setEmbBaseUrl] = useState('http://127.0.0.1:11434');
  const [embModel, setEmbModel] = useState('nomic-embed-text');
  const [embApiKey, setEmbApiKey] = useState('');
  const [embHybridAlpha, setEmbHybridAlpha] = useState(0.55);
  const [embDimensions, setEmbDimensions] = useState(768);
  const [embSaving, setEmbSaving] = useState(false);

  const loadTools = useCallback(async () => {
    const p = activeWorkspacePath?.trim();
    if (!p) {
      setToolsSel({ ...DEFAULT_WORKSPACE_TOOL_SELECTION });
      return;
    }
    const res = await window.electronAPI?.workspaceGetToolSelection?.(p);
    if (res?.ok === true && res.tools) {
      setToolsSel({ ...DEFAULT_WORKSPACE_TOOL_SELECTION, ...res.tools });
    } else {
      setToolsSel({ ...DEFAULT_WORKSPACE_TOOL_SELECTION });
    }
  }, [activeWorkspacePath]);

  useEffect(() => {
    void loadTools();
  }, [loadTools]);

  const loadEmbeddingPrefs = useCallback(async () => {
    try {
      const res = await window.electronAPI?.hermesGetEmbeddingPrefs?.();
      if (!res?.ok) return;
      const p = res.prefs ?? {};
      if (typeof p.enabled === 'boolean') setEmbEnabled(p.enabled);
      if (p.provider === 'openai' || p.provider === 'ollama') setEmbProvider(p.provider);
      if (typeof p.baseUrl === 'string' && p.baseUrl.trim()) setEmbBaseUrl(p.baseUrl.trim());
      if (typeof p.model === 'string' && p.model.trim()) setEmbModel(p.model.trim());
      if (typeof p.apiKey === 'string') setEmbApiKey(p.apiKey);
      if (typeof p.hybridAlpha === 'number' && Number.isFinite(p.hybridAlpha)) {
        setEmbHybridAlpha(Math.min(1, Math.max(0, p.hybridAlpha)));
      }
      if (typeof p.dimensions === 'number' && p.dimensions >= 64) setEmbDimensions(Math.floor(p.dimensions));
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void loadEmbeddingPrefs();
  }, [loadEmbeddingPrefs]);

  const onSaveEmbeddingPrefs = async () => {
    setEmbSaving(true);
    try {
      const res = await window.electronAPI?.hermesSaveEmbeddingPrefs?.({
        enabled: embEnabled,
        provider: embProvider,
        baseUrl: embBaseUrl.trim(),
        model: embModel.trim(),
        apiKey: embApiKey.trim(),
        hybridAlpha: embHybridAlpha,
        dimensions: embDimensions,
      });
      if (res?.ok) {
        (window as any).__cf_toast?.success?.(t('settings.savedTitle'), t('settings.memory.embeddingSaved'));
      } else {
        (window as any).__cf_toast?.error?.(
          t('settings.memory.embeddingSaveFail'),
          res && 'error' in res ? res.error : undefined
        );
      }
    } finally {
      setEmbSaving(false);
    }
  };

  const onSaveTools = async () => {
    const p = activeWorkspacePath?.trim();
    if (!p) return;
    setToolsSaving(true);
    try {
      const res = await window.electronAPI?.workspaceSetToolSelection?.(p, toolsSel);
      if (res?.ok) {
        (window as any).__cf_toast?.success?.(t('settings.savedTitle'), t('settings.memory.toolsSaved'));
      } else {
        (window as any).__cf_toast?.error?.(
          t('settings.memory.toolsSaveFail'),
          res && 'error' in res ? res.error : undefined
        );
      }
    } finally {
      setToolsSaving(false);
    }
  };

  const onSearch = async () => {
    const q = searchQuery.trim();
    if (!q) return;
    if (!activeWorkspacePath?.trim()) {
      setSearchError(t('settings.noWorkspaceSelected'));
      return;
    }
    setSearchBusy(true);
    setSearchError(null);
    try {
      const res = await window.electronAPI?.memoryFtsSearch?.({ query: q, limit: 12 });
      if (!res || !('ok' in res) || !res.ok) {
        setHits([]);
        setSearchError(String((res as { error?: string })?.error ?? t('settings.memory.searchFail')));
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

  const onRebuild = async () => {
    if (!activeWorkspacePath?.trim()) {
      (window as any).__cf_toast?.error?.(t('settings.memory.rebuildFail'), t('settings.noWorkspaceSelected'));
      return;
    }
    setRebuildBusy(true);
    try {
      const res = await window.electronAPI?.memoryFtsRebuild?.();
      if (!res || !('ok' in res) || !res.ok) {
        throw new Error(String((res as { error?: string })?.error ?? 'rebuild_failed'));
      }
      setLastRebuild({ indexed: res.indexed, pruned: res.pruned });
      (window as any).__cf_toast?.success?.(
        t('settings.savedTitle'),
        t('settings.memory.rebuildOk', { indexed: res.indexed, pruned: res.pruned })
      );
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      (window as any).__cf_toast?.error?.(t('settings.memory.rebuildFail'), msg);
    } finally {
      setRebuildBusy(false);
    }
  };

  const noWs = !activeWorkspacePath?.trim();

  return (
    <>
      <div className="cf-card">
        <h3>{t('settings.memory.overviewTitle')}</h3>
        <div className="cf-divider" />
        <p className="cf-help" style={{ marginBottom: 12 }}>
          {t('settings.memory.overviewLead')}
        </p>
        <div className="cf-memoryLayers">
          <div className="cf-memoryLayer">
            <div className="cf-memoryLayer__badge">L0</div>
            <div className="cf-memoryLayer__body">
              <strong>{t('settings.memory.l0Title')}</strong>
              <div className="cf-help">{t('settings.memory.l0Help')}</div>
              <code className="cf-inlineCode">abstract:</code>
            </div>
          </div>
          <div className="cf-memoryLayer">
            <div className="cf-memoryLayer__badge">L1</div>
            <div className="cf-memoryLayer__body">
              <strong>{t('settings.memory.l1Title')}</strong>
              <div className="cf-help">{t('settings.memory.l1Help')}</div>
              <code className="cf-inlineCode">overview:</code>
            </div>
          </div>
          <div className="cf-memoryLayer">
            <div className="cf-memoryLayer__badge">L2</div>
            <div className="cf-memoryLayer__body">
              <strong>{t('settings.memory.l2Title')}</strong>
              <div className="cf-help">{t('settings.memory.l2Help')}</div>
            </div>
          </div>
        </div>
        <div className="cf-help cf-settingsModels__mono" style={{ marginTop: 14, wordBreak: 'break-all' }}>
          {t('settings.memory.storagePath')}: .agent/.memory/
          <br />
          {t('settings.memory.indexPath')}: .agent/.clawflow/hermes-memory.db
        </div>
      </div>

      <div className="cf-card">
        <h3>{t('settings.memory.toolsTitle')}</h3>
        <div className="cf-divider" />
        <p className="cf-help" style={{ marginBottom: 12 }}>
          {t('settings.memory.toolsLead')}
        </p>
        {noWs ? (
          <div className="cf-help">{t('settings.noWorkspaceSelected')}</div>
        ) : (
          <>
            <Checkbox
              checked={toolsSel.knowledge_base}
              onChange={(e) => setToolsSel((s) => ({ ...s, knowledge_base: e.target.checked }))}
            >
              {t('workspace.tool_knowledge_base')}
            </Checkbox>
            <div className="cf-help" style={{ marginTop: 8, marginBottom: 14 }}>
              {t('settings.memory.knowledgeBaseHelp')}
            </div>
            <div className="cf-help" style={{ marginBottom: 14 }}>
              {t('settings.memory.skillsIndexHint')}
            </div>
            <button
              type="button"
              className="cf-btn cf-btnPrimary cf-btnSmall"
              disabled={toolsSaving}
              onClick={() => void onSaveTools()}
            >
              {toolsSaving ? t('settings.systemAgents.saving') : t('common.save')}
            </button>
          </>
        )}
      </div>

      <div className="cf-card">
        <h3>{t('settings.memory.embeddingTitle')}</h3>
        <div className="cf-divider" />
        <p className="cf-help" style={{ marginBottom: 12 }}>
          {t('settings.memory.embeddingLead')}
        </p>
        <Checkbox checked={embEnabled} onChange={(e) => setEmbEnabled(e.target.checked)}>
          {t('settings.memory.embeddingEnabled')}
        </Checkbox>
        <div className="cf-row" style={{ flexWrap: 'wrap', gap: 8, marginTop: 12, marginBottom: 8 }}>
          <label className="cf-help" style={{ minWidth: 120 }}>
            {t('settings.memory.embeddingProvider')}
          </label>
          <select
            className="cf-input"
            style={{ minWidth: 160 }}
            value={embProvider}
            onChange={(e) => setEmbProvider(e.target.value === 'openai' ? 'openai' : 'ollama')}
          >
            <option value="ollama">{t('settings.memory.embeddingProviderOllama')}</option>
            <option value="openai">{t('settings.memory.embeddingProviderOpenai')}</option>
          </select>
        </div>
        <div className="cf-row" style={{ flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
          <input
            className="cf-input"
            style={{ flex: '1 1 220px' }}
            value={embBaseUrl}
            onChange={(e) => setEmbBaseUrl(e.target.value)}
            placeholder={t('settings.memory.embeddingBaseUrl')}
          />
          <input
            className="cf-input"
            style={{ flex: '1 1 160px' }}
            value={embModel}
            onChange={(e) => setEmbModel(e.target.value)}
            placeholder={t('settings.memory.embeddingModel')}
          />
        </div>
        {embProvider === 'openai' ? (
          <input
            className="cf-input"
            style={{ width: '100%', marginBottom: 8 }}
            type="password"
            value={embApiKey}
            onChange={(e) => setEmbApiKey(e.target.value)}
            placeholder={t('settings.memory.embeddingApiKey')}
          />
        ) : null}
        <div className="cf-row" style={{ flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
          <input
            className="cf-input"
            style={{ flex: '1 1 120px' }}
            type="number"
            min={0}
            max={1}
            step={0.05}
            value={embHybridAlpha}
            onChange={(e) => setEmbHybridAlpha(Number(e.target.value))}
            title={t('settings.memory.embeddingHybridAlpha')}
          />
          <input
            className="cf-input"
            style={{ flex: '1 1 100px' }}
            type="number"
            min={64}
            max={4096}
            step={1}
            value={embDimensions}
            onChange={(e) => setEmbDimensions(Number(e.target.value))}
            title={t('settings.memory.embeddingDimensions')}
          />
        </div>
        <button
          type="button"
          className="cf-btn cf-btnPrimary cf-btnSmall"
          disabled={embSaving}
          onClick={() => void onSaveEmbeddingPrefs()}
        >
          {embSaving ? t('settings.systemAgents.saving') : t('common.save')}
        </button>
      </div>

      <div className="cf-card">
        <h3>{t('settings.memory.ftsTitle')}</h3>
        <div className="cf-divider" />
        <p className="cf-help" style={{ marginBottom: 12 }}>
          {t('settings.memory.ftsLead')}
        </p>
        {noWs ? (
          <div className="cf-help">{t('settings.noWorkspaceSelected')}</div>
        ) : (
          <>
            <div className="cf-row" style={{ flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
              <input
                className="cf-input"
                style={{ flex: '1 1 220px', minWidth: 180 }}
                value={searchQuery}
                placeholder={t('settings.memory.searchPlaceholder')}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void onSearch();
                }}
              />
              <button
                type="button"
                className="cf-btn cf-btnPrimary cf-btnSmall"
                disabled={searchBusy || !searchQuery.trim()}
                onClick={() => void onSearch()}
              >
                {searchBusy ? t('settings.memory.searching') : t('settings.memory.searchAction')}
              </button>
              <button
                type="button"
                className="cf-btn cf-btnGhost cf-btnSmall"
                disabled={rebuildBusy}
                onClick={() => void onRebuild()}
              >
                {rebuildBusy ? t('settings.memory.rebuilding') : t('settings.memory.rebuildAction')}
              </button>
            </div>
            {lastRebuild ? (
              <div className="cf-help" style={{ marginBottom: 10 }}>
                {t('settings.memory.lastRebuild', {
                  indexed: lastRebuild.indexed,
                  pruned: lastRebuild.pruned,
                })}
              </div>
            ) : null}
            {searchError ? <div className="cf-errorText" style={{ marginBottom: 8 }}>{searchError}</div> : null}
            {hits.length > 0 ? (
              <ul className="cf-memoryHitList">
                {hits.map((h) => (
                  <li key={h.id} className="cf-memoryHit">
                    <div className="cf-memoryHit__title">
                      {h.title || h.source_path}
                      <span className="cf-sub"> · {h.source_kind}</span>
                    </div>
                    {h.abstract ? (
                      <div className="cf-memoryHit__l0">
                        <strong>L0</strong> {h.abstract}
                      </div>
                    ) : null}
                    {h.overview ? (
                      <div className="cf-memoryHit__l1">
                        <strong>L1</strong> {h.overview}
                      </div>
                    ) : null}
                    <pre className="cf-memoryHit__snippet">{h.snippet}</pre>
                  </li>
                ))}
              </ul>
            ) : searchQuery.trim() && !searchBusy && !searchError ? (
              <div className="cf-help">{t('settings.memory.searchEmpty')}</div>
            ) : null}
          </>
        )}
      </div>
    </>
  );
};

export default MemorySettingsPanel;
