import { FC, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Connector, ConnectorConfig, useConnectorStore } from '../../store/modules/connectorStore';
import EmptyState from '../../components/common/EmptyState';
import Loading from '../../components/common/Loading';
import './styles.css';

type TestPhase = 'idle' | 'running' | 'ok' | 'fail';

const ConnectorsPage: FC = () => {
  const { t } = useTranslation();
  const {
    connectors,
    isLoading,
    error,
    fetchConnectors,
    addConnector,
    updateConnector,
    deleteConnector,
    testConnection,
    setError,
  } = useConnectorStore();

  const [query, setQuery] = useState('');
  const [activeId, setActiveId] = useState<string | null>(null);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<Connector | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const [fSpec, setFSpec] = useState('');
  const [specErr, setSpecErr] = useState<string | null>(null);
  const [testPhase, setTestPhase] = useState<TestPhase>('idle');
  const [reveal, setReveal] = useState(false);

  const testText = useMemo(() => {
    switch (testPhase) {
      case 'running':
        return t('connectors.testRunning');
      case 'ok':
        return t('connectors.testOkResult');
      case 'fail':
        return t('connectors.testFailResult');
      default:
        return t('connectors.drawerTestIdle');
    }
  }, [t, testPhase]);

  useEffect(() => {
    void fetchConnectors();
  }, [fetchConnectors]);

  // OpenClaw CLI dependency removed; connectors are managed via built-in engine.

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return connectors;
    return connectors.filter((c) => {
      return (
        c.name.toLowerCase().includes(q) ||
        c.type.toLowerCase().includes(q) ||
        JSON.stringify(c.config ?? {}).toLowerCase().includes(q)
      );
    });
  }, [connectors, query]);

  const active = useMemo(() => {
    const fallback = filtered[0] ?? null;
    if (!activeId) return fallback;
    return filtered.find((c) => c.id === activeId) ?? fallback;
  }, [activeId, filtered]);

  useEffect(() => {
    if (active?.id) setActiveId(active.id);
  }, [active?.id]);

  useEffect(() => {
    if (active?.id) setTestPhase('idle');
  }, [active?.id]);

  const openDrawer = (mode: 'add' | 'edit') => {
    setSpecErr(null);
    setTestPhase('idle');
    setReveal(false);
    if (mode === 'edit' && active) {
      setEditing(active);
      setFSpec(active.id);
    } else {
      setEditing(null);
      setFSpec('');
    }
    setDrawerOpen(true);
  };

  const submit = async () => {
    const spec = fSpec.trim();
    if (!spec) {
      setSpecErr(t('connectors.tokenRequired'));
      (window as any).__cf_toast?.error?.(t('connectors.validateFailTitle'), t('connectors.validateFailBody'));
      return;
    }

    const payload: ConnectorConfig = {
      name: spec,
      type: 'plugin',
      config: {
        spec,
      },
    };

    try {
      if (editing) {
        await updateConnector(editing.id, payload);
        (window as any).__cf_toast?.success?.(t('connectors.saveOkTitle'), t('connectors.saveOkBody'));
      } else {
        await addConnector(payload);
        (window as any).__cf_toast?.success?.(t('connectors.addOkTitle'), t('connectors.addOkBody'));
      }
      setDrawerOpen(false);
      setEditing(null);
    } catch (e: any) {
      (window as any).__cf_toast?.error?.(t('connectors.saveFailTitle'), e?.message || t('common.sampleOpFailBody'));
    }
  };

  const runTest = async (id: string) => {
    setTestPhase('running');
    const ok = await testConnection(id);
    if (ok) {
      setTestPhase('ok');
      (window as any).__cf_toast?.success?.(t('connectors.testOkTitle'), t('connectors.testOkBody'));
    } else {
      setTestPhase('fail');
      (window as any).__cf_toast?.error?.(t('connectors.testFailTitle'), t('connectors.testFailBody'));
    }
  };

  const setEnabled = async (id: string, enabled: boolean) => {
    try {
      await updateConnector(id, { action: enabled ? 'enable' : 'disable' } as any);
      (window as any).__cf_toast?.success?.(
        enabled ? t('connectors.enabledTitle') : t('connectors.disabledTitle'),
        enabled ? t('connectors.enabledBody') : t('connectors.disabledBody')
      );
    } catch (e: any) {
      (window as any).__cf_toast?.error?.(t('connectors.opFailTitle'), e?.message || t('common.sampleOpFailBody'));
    }
  };

  return (
    <div className="cf-connectorsPage">
      <div className="cf-topbar">
        <div className="cf-pageTitle">
          <h2>{t('connectors.title')}</h2>
          <p>{t('connectors.subtitle')}</p>
        </div>
        <div className="cf-row">
          <button className="cf-btn cf-btnGhost" onClick={() => void fetchConnectors()}>
            {isLoading ? t('connectors.refreshing') : t('common.refresh')}
          </button>
          <button className="cf-btn cf-btnPrimary" onClick={() => openDrawer('add')}>
            {t('connectors.add')}
          </button>
        </div>
      </div>

      {null}

      {error ? (
        <div className="cf-banner" style={{ borderColor: 'rgba(194,75,75,.45)', background: 'rgba(194,75,75,.10)' }}>
          <div>
            <b>{t('connectors.opFailed')}</b>
            <span>{error}</span>
          </div>
          <button className="cf-btn cf-btnGhost" onClick={() => setError(null)}>
            {t('common.clear')}
          </button>
        </div>
      ) : null}

      <section className="cf-connectorsSplit" style={{ marginTop: 12 }}>
        <div className="cf-card">
          <div className="cf-row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0 }}>{t('connectors.listTitle')}</h3>
            <button
              className="cf-btn cf-btnSmall"
              onClick={() =>
                (window as any).__cf_toast?.success?.(t('common.sampleTitle'), t('connectors.searchToastBody'))
              }
            >
              {t('connectors.searchHintBtn')}
            </button>
          </div>
          <div style={{ height: 10 }} />
          <input
            className="cf-input"
            placeholder={t('connectors.searchPlaceholder')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div style={{ height: 10 }} />

          {isLoading && connectors.length === 0 ? (
            <Loading label={t('connectors.refreshing')} />
          ) : filtered.length === 0 ? (
            <EmptyState
              title={t('connectors.emptyTitle')}
              description={t('connectors.emptySub')}
              actionLabel={t('connectors.addFirst')}
              onAction={() => openDrawer('add')}
            />
          ) : (
            <div className="cf-connList">
              {filtered.map((c) => (
                <div
                  key={c.id}
                  className={c.id === active?.id ? 'cf-connItem cf-connItem--active' : 'cf-connItem'}
                  role="button"
                  tabIndex={0}
                  onClick={() => setActiveId(c.id)}
                >
                  <div style={{ minWidth: 0 }}>
                    <b style={{ fontSize: 12 }}>{c.name}</b>
                    <div className="cf-sub">{t('connectors.lineType', { type: c.type })}</div>
                  </div>
                  <span
                    className={
                      c.status === 'connected'
                        ? 'cf-chip cf-chipRunning'
                        : c.status === 'error'
                          ? 'cf-chip'
                          : 'cf-chip cf-chipUnknown'
                    }
                    style={
                      c.status === 'error'
                        ? { borderColor: 'rgba(194,75,75,.5)', background: 'rgba(194,75,75,.12)', color: '#F0B4B4' }
                        : undefined
                    }
                  >
                    {c.status === 'connected'
                      ? t('connectors.okChip')
                      : c.status === 'error'
                        ? t('connectors.failChip')
                        : t('connectors.unknownChip')}
                  </span>
                </div>
              ))}
            </div>
          )}

          <div className="cf-divider" />
          <div className="cf-help">{t('connectors.sensitiveHint')}</div>
        </div>

        <div className="cf-card">
          <div className="cf-row" style={{ alignItems: 'center', justifyContent: 'space-between' }}>
            <h3 style={{ margin: 0 }}>{t('connectors.detailTitle', { name: active?.name ?? '-' })}</h3>
            <span
              className={
                active?.status === 'connected'
                  ? 'cf-chip cf-chipRunning'
                  : active?.status === 'error'
                    ? 'cf-chip'
                    : 'cf-chip cf-chipUnknown'
              }
              style={
                active?.status === 'error'
                  ? { borderColor: 'rgba(194,75,75,.5)', background: 'rgba(194,75,75,.12)', color: '#F0B4B4' }
                  : undefined
              }
            >
              {active?.status === 'connected'
                ? t('connectors.connected')
                : active?.status === 'error'
                  ? t('connectors.abnormal')
                  : t('connectors.untested')}
            </span>
          </div>

          <div className="cf-divider" />

          {active ? (
            <div className="cf-grid">
              <div className="cf-card cf-col6">
                <h3>{t('connectors.basicInfo')}</h3>
                <div className="cf-sub">{t('connectors.lineName', { name: active.name })}</div>
                <div className="cf-sub">{t('connectors.lineType', { type: active.type })}</div>
                <div className="cf-sub">
                  {t('connectors.lineUpdated', { value: new Date(active.updatedAt).toLocaleString() })}
                </div>
              </div>
              <div className="cf-card cf-col6">
                <h3>{t('connectors.configMasked')}</h3>
                <pre className="cf-code" style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
                  {reveal ? JSON.stringify(active.config ?? {}, null, 2) : '{ … }'}
                </pre>
                <div style={{ height: 8 }} />
                <button className="cf-btn cf-btnGhost cf-btnSmall" onClick={() => setReveal((v) => !v)}>
                  {reveal ? t('connectors.hide') : t('connectors.reveal')}
                </button>
              </div>

              <div className="cf-card cf-col12">
                <h3>{t('connectors.actions')}</h3>
                <div className="cf-row">
                  <button className="cf-btn" onClick={() => openDrawer('edit')}>
                    {t('connectors.edit')}
                  </button>
                  {active.status === 'connected' ? (
                    <button className="cf-btn" disabled={isLoading} onClick={() => void setEnabled(active.id, false)}>
                      {t('connectors.disable')}
                    </button>
                  ) : (
                    <button className="cf-btn" disabled={isLoading} onClick={() => void setEnabled(active.id, true)}>
                      {t('connectors.enable')}
                    </button>
                  )}
                  <button className="cf-btn cf-btnDanger" onClick={() => setDeleteOpen(true)}>
                    {t('common.delete')}
                  </button>
                  <button className="cf-btn cf-btnPrimary" onClick={() => void runTest(active.id)}>
                    {t('connectors.testConn')}
                  </button>
                </div>
                <div style={{ height: 10 }} />
                <div className="cf-card">
                  <h3>{t('connectors.testResult')}</h3>
                  <div className="cf-sub">{testText}</div>
                  <div className="cf-help">{t('connectors.testFailHint')}</div>
                </div>
              </div>
            </div>
          ) : (
            <div className="cf-sub">{t('connectors.selectFirst')}</div>
          )}
        </div>
      </section>

      {drawerOpen ? <div className="cf-overlay" onClick={() => setDrawerOpen(false)} /> : null}
      <aside className={drawerOpen ? 'cf-drawer cf-drawer--show' : 'cf-drawer'} aria-hidden={!drawerOpen}>
        <div className="cf-drawerHead">
          <div>
            <h3 style={{ margin: 0 }}>{editing ? t('connectors.drawerEdit') : t('connectors.drawerAdd')}</h3>
            <p className="cf-sub" style={{ margin: '6px 0 0 0' }}>
              {t('connectors.drawerSub')}
            </p>
          </div>
          <button className="cf-btn cf-btnGhost cf-btnSmall" onClick={() => setDrawerOpen(false)}>
            {t('connectors.drawerClose')}
          </button>
        </div>
        <div className="cf-drawerBody">
          <div className="cf-sub" style={{ marginBottom: 6 }}>
            {t('connectors.fieldName')}
          </div>
          <input
            className="cf-input"
            value={fSpec}
            onChange={(e) => setFSpec(e.target.value)}
            placeholder={t('connectors.fieldNamePh')}
          />
          {specErr ? (
            <div className="cf-errorText" style={{ marginTop: 6 }}>
              {specErr}
            </div>
          ) : null}

          <div style={{ height: 12 }} />
          <div className="cf-card">
            <h3>{t('connectors.drawerTestTitle')}</h3>
            <div className="cf-sub">{testText}</div>
            <div style={{ height: 10 }} />
            <button
              className="cf-btn"
              onClick={() => {
                if (editing?.id) void runTest(editing.id);
                else (window as any).__cf_toast?.error?.(t('connectors.cannotTestTitle'), t('connectors.cannotTestBody'));
              }}
            >
              {t('connectors.testConn')}
            </button>
          </div>
        </div>
        <div className="cf-drawerFoot">
          <button className="cf-btn" onClick={() => setDrawerOpen(false)}>
            {t('connectors.drawerCancel')}
          </button>
          <button className="cf-btn cf-btnPrimary" disabled={isLoading} onClick={() => void submit()}>
            {t('connectors.drawerSave')}
          </button>
        </div>
      </aside>

      {deleteOpen ? <div className="cf-overlay" onClick={() => setDeleteOpen(false)} /> : null}
      <div className={deleteOpen ? 'cf-modal cf-modal--show' : 'cf-modal'} aria-hidden={!deleteOpen}>
        <h3 style={{ margin: '0 0 6px 0', fontSize: 14 }}>{t('connectors.deleteConfirmTitle')}</h3>
        <p className="cf-sub" style={{ margin: 0 }}>
          {t('connectors.deleteConfirmSub')}
        </p>
        <div className="cf-modalActions">
          <button className="cf-btn" onClick={() => setDeleteOpen(false)}>
            {t('connectors.drawerCancel')}
          </button>
          <button
            className="cf-btn cf-btnDanger"
            onClick={async () => {
              if (!active) return;
              setDeleteOpen(false);
              await deleteConnector(active.id);
              (window as any).__cf_toast?.success?.(t('connectors.deletedOkTitle'), t('connectors.deletedOkBody'));
            }}
          >
            {t('common.delete')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConnectorsPage;