import { FC, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Connector, ConnectorConfig, useConnectorStore } from '../../store/modules/connectorStore';
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

  const [fName, setFName] = useState('');
  const [fType, setFType] = useState('github');
  const [fHost, setFHost] = useState('');
  const [fToken, setFToken] = useState('');
  const [fNote, setFNote] = useState('');
  const [tokenErr, setTokenErr] = useState<string | null>(null);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    setTokenErr(null);
    setTestPhase('idle');
    setReveal(false);
    if (mode === 'edit' && active) {
      setEditing(active);
      setFName(active.name);
      setFType(active.type);
      setFHost(String((active.config as any)?.host ?? (active.config as any)?.endpoint ?? ''));
      setFToken(String((active.config as any)?.token ?? (active.config as any)?.apiKey ?? ''));
      setFNote(String((active.config as any)?.note ?? ''));
    } else {
      setEditing(null);
      setFName('');
      setFType('github');
      setFHost('');
      setFToken('');
      setFNote('');
    }
    setDrawerOpen(true);
  };

  const submit = async () => {
    const token = fToken.trim();
    if (!token) {
      setTokenErr(t('connectors.tokenRequired'));
      (window as any).__cf_toast?.error?.(t('connectors.validateFailTitle'), t('connectors.validateFailBody'));
      return;
    }

    const payload: ConnectorConfig = {
      name: fName.trim() || t('connectors.unnamed'),
      type: fType,
      config: {
        host: fHost.trim(),
        token,
        note: fNote.trim(),
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

          {filtered.length === 0 ? (
            <div className="cf-card">
              <h3 style={{ marginBottom: 6 }}>{t('connectors.emptyTitle')}</h3>
              <div className="cf-sub">{t('connectors.emptySub')}</div>
              <div style={{ height: 12 }} />
              <button className="cf-btn cf-btnPrimary" onClick={() => openDrawer('add')}>
                {t('connectors.addFirst')}
              </button>
            </div>
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
                <div className="cf-sub">
                  {t('connectors.lineHost', { value: String((active.config as any)?.host ?? '-') })}
                </div>
                <div className="cf-sub">
                  {t('connectors.token')}：
                  {reveal
                    ? String((active.config as any)?.token ?? '—')
                    : '••••' + String((active.config as any)?.token ?? '0000').slice(-4)}
                  <button className="cf-btn cf-btnGhost cf-btnSmall" style={{ marginLeft: 8 }} onClick={() => setReveal((v) => !v)}>
                    {reveal ? t('connectors.hide') : t('connectors.reveal')}
                  </button>
                </div>
                <div className="cf-help">{t('connectors.maskHint')}</div>
              </div>

              <div className="cf-card cf-col12">
                <h3>{t('connectors.actions')}</h3>
                <div className="cf-row">
                  <button className="cf-btn" onClick={() => openDrawer('edit')}>
                    {t('connectors.edit')}
                  </button>
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
          <input className="cf-input" value={fName} onChange={(e) => setFName(e.target.value)} placeholder={t('connectors.fieldNamePh')} />

          <div style={{ height: 10 }} />
          <div className="cf-sub" style={{ marginBottom: 6 }}>
            {t('connectors.fieldType')}
          </div>
          <select className="cf-select" value={fType} onChange={(e) => setFType(e.target.value)}>
            <option value="feishu">feishu</option>
            <option value="github">github</option>
            <option value="postgres">postgres</option>
            <option value="custom">custom</option>
          </select>

          <div style={{ height: 10 }} />
          <div className="cf-sub" style={{ marginBottom: 6 }}>
            {t('connectors.fieldHost')}
          </div>
          <input className="cf-input" value={fHost} onChange={(e) => setFHost(e.target.value)} placeholder={t('connectors.fieldHostPh')} />
          <div className="cf-help">{t('connectors.fieldHostHint')}</div>

          <div style={{ height: 10 }} />
          <div className="cf-sub" style={{ marginBottom: 6 }}>
            {t('connectors.fieldToken')}
          </div>
          <input className="cf-input" value={fToken} onChange={(e) => setFToken(e.target.value)} placeholder="••••••••" />
          {tokenErr ? <div className="cf-errorText" style={{ marginTop: 6 }}>{tokenErr}</div> : null}

          <div style={{ height: 10 }} />
          <div className="cf-sub" style={{ marginBottom: 6 }}>
            {t('connectors.fieldNote')}
          </div>
          <textarea className="cf-textarea" value={fNote} onChange={(e) => setFNote(e.target.value)} placeholder={t('connectors.fieldNotePh')} />

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