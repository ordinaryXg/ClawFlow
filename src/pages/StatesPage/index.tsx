import { FC } from 'react';

const StatesPage: FC = () => {
  return (
    <>
      <div className="cf-topbar">
        <div className="cf-pageTitle">
          <h2>空 / 错 / 载 状态库</h2>
          <p>把关键错误分层，并确保每条提示都可行动（下一步）。</p>
        </div>
        <div className="cf-row">
          <button
            className="cf-btn cf-btnGhost"
            onClick={() => (window as any).__cf_toast?.success?.('操作成功', '变更已应用，可继续下一步。')}
          >
            成功 Toast
          </button>
          <button
            className="cf-btn cf-btnGhost"
            onClick={() => (window as any).__cf_toast?.error?.('请求失败', '请检查依赖或网络后重试。')}
          >
            错误 Toast
          </button>
        </div>
      </div>

      <section className="cf-grid">
        <div className="cf-card cf-col4">
          <h3>1) Gateway Unknown</h3>
          <div className="cf-row" style={{ alignItems: 'center', justifyContent: 'space-between' }}>
            <span className="cf-chip cf-chipUnknown">Unknown</span>
            <button className="cf-btn cf-btnSmall">刷新</button>
          </div>
          <div className="cf-divider" />
          <div className="cf-sub">原因可能是：依赖缺失 / 权限不足 / 命令超时。</div>
          <div style={{ height: 10 }} />
          <div className="cf-row">
            <a className="cf-btn cf-btnSmall" href="#/settings">
              去设置
            </a>
            <button className="cf-btn cf-btnSmall">查看日志</button>
          </div>
        </div>

        <div
          className="cf-card cf-col4"
          style={{ borderColor: 'rgba(138,106,42,.35)', background: 'linear-gradient(135deg,rgba(138,106,42,.16),rgba(255,255,255,.02))' }}
        >
          <h3>2) 依赖缺失（阻断）</h3>
          <div className="cf-sub">
            未找到 <span style={{ fontFamily: 'var(--mono)' }}>openclaw</span>，无法执行命令。
          </div>
          <div className="cf-divider" />
          <div className="cf-row">
            <a className="cf-btn cf-btnGold" href="#/settings">
              配置路径
            </a>
            <button className="cf-btn">安装指引</button>
          </div>
          <div className="cf-help">提示要明确：缺什么、去哪配、配完怎么验证。</div>
        </div>

        <div className="cf-card cf-col4">
          <h3>3) Skills 空状态</h3>
          <div className="cf-sub">当前筛选条件下没有结果。</div>
          <div className="cf-divider" />
          <button className="cf-btn cf-btnPrimary">清空筛选</button>
          <div className="cf-help">空状态不只是“空”，要给主 CTA。</div>
        </div>

        <div className="cf-card cf-col4">
          <h3>4) 连接测试失败（可恢复）</h3>
          <div className="cf-sub">失败：认证无效或权限不足。</div>
          <div className="cf-divider" />
          <div className="cf-sub">下一步建议：</div>
          <div className="cf-sub">- 检查 Token 是否过期</div>
          <div className="cf-sub">- 检查网络/代理</div>
          <div className="cf-sub">- 复制错误并查看日志</div>
          <div style={{ height: 10 }} />
          <div className="cf-row">
            <button className="cf-btn cf-btnPrimary cf-btnSmall">重试</button>
            <button className="cf-btn cf-btnSmall">复制错误</button>
            <button className="cf-btn cf-btnSmall">查看日志</button>
          </div>
        </div>

        <div className="cf-card cf-col4">
          <h3>5) 全局加载骨架</h3>
          <div
            style={{
              height: 46,
              borderRadius: 12,
              background:
                'linear-gradient(90deg, rgba(255,255,255,.04), rgba(255,255,255,.08), rgba(255,255,255,.04))',
              backgroundSize: '240% 100%',
              border: '1px solid rgba(255,255,255,.04)',
            }}
          />
          <div style={{ height: 10 }} />
          <div style={{ height: 12, width: '76%', borderRadius: 12, background: 'rgba(255,255,255,.05)' }} />
          <div style={{ height: 8 }} />
          <div style={{ height: 12, width: '54%', borderRadius: 12, background: 'rgba(255,255,255,.05)' }} />
          <div style={{ height: 12 }} />
          <div className="cf-help">避免“点击无反应”：操作必须有 loading。</div>
        </div>

        <div className="cf-card cf-col4">
          <h3>6) 网络/离线错误</h3>
          <div className="cf-sub">当前网络不可用，部分连接器测试可能失败。</div>
          <div className="cf-divider" />
          <button className="cf-btn cf-btnPrimary">重试</button>
          <button className="cf-btn">进入离线模式（可选）</button>
          <div className="cf-help">提示要“可行动”，不要只给红字。</div>
        </div>
      </section>
    </>
  );
};

export default StatesPage;

