import { FC, useEffect, useMemo, useState } from 'react';
import { Connector, ConnectorConfig, useConnectorStore } from '../../store/modules/connectorStore';
import './styles.css';

const ConnectorsPage: FC = () => {
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
  const [testText, setTestText] = useState('未测试。');
  const [reveal, setReveal] = useState(false);

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

  const openDrawer = (mode: 'add' | 'edit') => {
    setTokenErr(null);
    setTestText('未测试。');
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
      setTokenErr('Token 不能为空');
      (window as any).__cf_toast?.error?.('校验失败', '请补全必填项后再保存。');
      return;
    }

    const payload: ConnectorConfig = {
      name: fName.trim() || '未命名连接器',
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
        (window as any).__cf_toast?.success?.('已保存', '连接器已更新，建议立即测试连接。');
      } else {
        await addConnector(payload);
        (window as any).__cf_toast?.success?.('已新增', '连接器已创建，建议立即测试连接。');
      }
      setDrawerOpen(false);
      setEditing(null);
    } catch (e: any) {
      (window as any).__cf_toast?.error?.('保存失败', e?.message || '请稍后重试。');
    }
  };

  const runTest = async (id: string) => {
    setTestText('测试中…');
    const ok = await testConnection(id);
    if (ok) {
      setTestText('成功：认证通过，权限正常。');
      (window as any).__cf_toast?.success?.('测试成功', '连接器可用于技能调用。');
    } else {
      setTestText('失败：Token 无效或权限不足。下一步：检查 Token → 重新测试 → 查看日志。');
      (window as any).__cf_toast?.error?.('测试失败', '请检查 Token/网络，或前往日志查看详细错误。');
    }
  };

  return (
    <div className="cf-connectorsPage">
      <div className="cf-topbar">
        <div className="cf-pageTitle">
          <h2>Connectors</h2>
          <p>新增/编辑/删除 · 测试连接 · 敏感字段脱敏展示。</p>
        </div>
        <div className="cf-row">
          <button className="cf-btn cf-btnGhost" onClick={() => void fetchConnectors()}>{isLoading ? '刷新中…' : '刷新'}</button>
          <button className="cf-btn cf-btnPrimary" onClick={() => openDrawer('add')}>新增连接器</button>
        </div>
      </div>

      {error ? (
        <div className="cf-banner" style={{ borderColor: 'rgba(194,75,75,.45)', background: 'rgba(194,75,75,.10)' }}>
          <div>
            <b>操作失败</b>
            <span>{error}</span>
          </div>
          <button className="cf-btn cf-btnGhost" onClick={() => setError(null)}>清除</button>
        </div>
      ) : null}

      <section className="cf-connectorsSplit" style={{ marginTop: 12 }}>
        <div className="cf-card">
          <div className="cf-row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0 }}>列表</h3>
            <button
              className="cf-btn cf-btnSmall"
              onClick={() => (window as any).__cf_toast?.success?.('提示', '支持按名称/类型搜索；建议提供筛选：已测试/未测试/失败。')}
            >
              搜索提示
            </button>
          </div>
          <div style={{ height: 10 }} />
          <input className="cf-input" placeholder="搜索连接器（名称/类型/配置）…" value={query} onChange={(e) => setQuery(e.target.value)} />
          <div style={{ height: 10 }} />

          {filtered.length === 0 ? (
            <div className="cf-card">
              <h3 style={{ marginBottom: 6 }}>暂无连接器</h3>
              <div className="cf-sub">添加一个连接器，让技能获得外部能力。</div>
              <div style={{ height: 12 }} />
              <button className="cf-btn cf-btnPrimary" onClick={() => openDrawer('add')}>添加第一个连接器</button>
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
                    <div className="cf-sub">type: {c.type}</div>
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
                    {c.status === 'connected' ? 'OK' : c.status === 'error' ? 'FAIL' : '?'}
                  </span>
                </div>
              ))}
            </div>
          )}

          <div className="cf-divider" />
          <div className="cf-help">敏感字段默认脱敏；可在详情面板临时“显示/隐藏”。</div>
        </div>

        <div className="cf-card">
          <div className="cf-row" style={{ alignItems: 'center', justifyContent: 'space-between' }}>
            <h3 style={{ margin: 0 }}>详情：{active?.name ?? '-'}</h3>
            <span className={active?.status === 'connected' ? 'cf-chip cf-chipRunning' : active?.status === 'error' ? 'cf-chip' : 'cf-chip cf-chipUnknown'}
              style={active?.status === 'error' ? { borderColor: 'rgba(194,75,75,.5)', background: 'rgba(194,75,75,.12)', color: '#F0B4B4' } : undefined}
            >
              {active?.status === 'connected' ? '已连接' : active?.status === 'error' ? '异常' : '未测试'}
            </span>
          </div>

          <div className="cf-divider" />

          {active ? (
            <div className="cf-grid">
              <div className="cf-card cf-col6">
                <h3>基础信息</h3>
                <div className="cf-sub">名称：{active.name}</div>
                <div className="cf-sub">类型：{active.type}</div>
                <div className="cf-sub">更新时间：{new Date(active.updatedAt).toLocaleString()}</div>
              </div>
              <div className="cf-card cf-col6">
                <h3>配置（脱敏）</h3>
                <div className="cf-sub">Host：{String((active.config as any)?.host ?? '-')}</div>
                <div className="cf-sub">
                  Token：{reveal ? String((active.config as any)?.token ?? '—') : '••••' + String((active.config as any)?.token ?? '0000').slice(-4)}
                  <button className="cf-btn cf-btnGhost cf-btnSmall" style={{ marginLeft: 8 }} onClick={() => setReveal((v) => !v)}>
                    {reveal ? '隐藏' : '显示'}
                  </button>
                </div>
                <div className="cf-help">仅临时显示，不在列表与日志中明文输出。</div>
              </div>

              <div className="cf-card cf-col12">
                <h3>操作</h3>
                <div className="cf-row">
                  <button className="cf-btn" onClick={() => openDrawer('edit')}>编辑</button>
                  <button className="cf-btn cf-btnDanger" onClick={() => setDeleteOpen(true)}>删除</button>
                  <button className="cf-btn cf-btnPrimary" onClick={() => void runTest(active.id)}>测试连接</button>
                </div>
                <div style={{ height: 10 }} />
                <div className="cf-card">
                  <h3>测试结果</h3>
                  <div className="cf-sub">{testText}</div>
                  <div className="cf-help">失败时必须给出原因 + 下一步（例如：检查 Token、检查网络、查看日志）。</div>
                </div>
              </div>
            </div>
          ) : (
            <div className="cf-sub">请选择一个连接器查看详情。</div>
          )}
        </div>
      </section>

      {drawerOpen ? <div className="cf-overlay" onClick={() => setDrawerOpen(false)} /> : null}
      <aside className={drawerOpen ? 'cf-drawer cf-drawer--show' : 'cf-drawer'} aria-hidden={!drawerOpen}>
        <div className="cf-drawerHead">
          <div>
            <h3 style={{ margin: 0 }}>{editing ? '编辑连接器' : '新增连接器'}</h3>
            <p className="cf-sub" style={{ margin: '6px 0 0 0' }}>配置完成后可点击“测试连接”，确保技能可用。</p>
          </div>
          <button className="cf-btn cf-btnGhost cf-btnSmall" onClick={() => setDrawerOpen(false)}>关闭</button>
        </div>
        <div className="cf-drawerBody">
          <div className="cf-sub" style={{ marginBottom: 6 }}>名称</div>
          <input className="cf-input" value={fName} onChange={(e) => setFName(e.target.value)} placeholder="例如：Feishu / Supabase" />

          <div style={{ height: 10 }} />
          <div className="cf-sub" style={{ marginBottom: 6 }}>类型</div>
          <select className="cf-select" value={fType} onChange={(e) => setFType(e.target.value)}>
            <option value="feishu">feishu</option>
            <option value="github">github</option>
            <option value="postgres">postgres</option>
            <option value="custom">custom</option>
          </select>

          <div style={{ height: 10 }} />
          <div className="cf-sub" style={{ marginBottom: 6 }}>端点 / 主机</div>
          <input className="cf-input" value={fHost} onChange={(e) => setFHost(e.target.value)} placeholder="https://... 或 host:port" />
          <div className="cf-help">不同类型可映射不同字段，此处只做原型示意。</div>

          <div style={{ height: 10 }} />
          <div className="cf-sub" style={{ marginBottom: 6 }}>API Key / Token</div>
          <input className="cf-input" value={fToken} onChange={(e) => setFToken(e.target.value)} placeholder="••••••••" />
          {tokenErr ? <div className="cf-errorText" style={{ marginTop: 6 }}>{tokenErr}</div> : null}

          <div style={{ height: 10 }} />
          <div className="cf-sub" style={{ marginBottom: 6 }}>备注</div>
          <textarea className="cf-textarea" value={fNote} onChange={(e) => setFNote(e.target.value)} placeholder="可选：用途、权限范围、失效时间等" />

          <div style={{ height: 12 }} />
          <div className="cf-card">
            <h3>测试连接</h3>
            <div className="cf-sub">{testText}</div>
            <div style={{ height: 10 }} />
            <button
              className="cf-btn"
              onClick={() => {
                if (editing?.id) void runTest(editing.id);
                else (window as any).__cf_toast?.error?.('无法测试', '请先保存连接器后再测试。');
              }}
            >
              测试连接
            </button>
          </div>
        </div>
        <div className="cf-drawerFoot">
          <button className="cf-btn" onClick={() => setDrawerOpen(false)}>取消</button>
          <button className="cf-btn cf-btnPrimary" disabled={isLoading} onClick={() => void submit()}>
            保存
          </button>
        </div>
      </aside>

      {deleteOpen ? <div className="cf-overlay" onClick={() => setDeleteOpen(false)} /> : null}
      <div className={deleteOpen ? 'cf-modal cf-modal--show' : 'cf-modal'} aria-hidden={!deleteOpen}>
        <h3 style={{ margin: '0 0 6px 0', fontSize: 14 }}>确认删除连接器？</h3>
        <p className="cf-sub" style={{ margin: 0 }}>该操作不可恢复。建议先确认没有技能依赖此连接器。</p>
        <div className="cf-modalActions">
          <button className="cf-btn" onClick={() => setDeleteOpen(false)}>取消</button>
          <button
            className="cf-btn cf-btnDanger"
            onClick={async () => {
              if (!active) return;
              setDeleteOpen(false);
              await deleteConnector(active.id);
              (window as any).__cf_toast?.success?.('已删除', '列表将刷新并移除该项。');
            }}
          >
            删除
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConnectorsPage;

