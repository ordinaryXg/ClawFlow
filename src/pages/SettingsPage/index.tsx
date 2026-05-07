import { FC, useEffect, useMemo, useState } from 'react';
import { useGatewayStore } from '../../store/modules/gatewayStore';
import { useSettingsStore } from '../../store/modules/settingsStore';

const SettingsPage: FC = () => {
  const { version, fetchVersion, error: gatewayError, fetchStatus } = useGatewayStore();
  const { theme, language, autoStartGateway, logLevel, updateSettings } = useSettingsStore();

  const [cliPath, setCliPath] = useState('');
  const [timeoutMs, setTimeoutMs] = useState(60000);

  useEffect(() => {
    void fetchVersion();
    void fetchStatus();
  }, [fetchStatus, fetchVersion]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const pathError = useMemo(() => {
    // 这里只做原型式“错误态”，真实校验交给主进程 validateCLI / path 选择器
    if (!cliPath) return '未找到 openclaw，可执行文件路径无效';
    return null;
  }, [cliPath]);

  return (
    <>
      <div className="cf-topbar">
        <div className="cf-pageTitle">
          <h2>Settings</h2>
          <p>主题/语言 · OpenClaw 路径 · 超时与日志 · 自动启动。</p>
        </div>
        <div className="cf-row">
          <button
            className="cf-btn cf-btnPrimary"
            onClick={() => {
              updateSettings({ theme, language, autoStartGateway, logLevel });
              // 静态提示：原型一致
              (window as any).__cf_toast?.success?.('已保存（示例）', '设置已持久化，部分配置需重启生效。');
            }}
          >
            保存设置（示例）
          </button>
        </div>
      </div>

      {gatewayError ? (
        <div className="cf-banner" style={{ borderColor: 'rgba(194,75,75,.45)', background: 'rgba(194,75,75,.10)' }}>
          <div>
            <b>检测失败</b>
            <span>{gatewayError}</span>
          </div>
          <button className="cf-btn cf-btnDanger" onClick={() => void fetchVersion()}>
            重试
          </button>
        </div>
      ) : null}

      <section className="cf-grid" style={{ marginTop: 12 }}>
        <div className="cf-card cf-col6">
          <h3>外观</h3>
          <div className="cf-divider" />

          <div className="cf-row" style={{ alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div className="cf-sub">
                <strong style={{ color: 'var(--text)' }}>主题</strong>
              </div>
              <div className="cf-help">切换立即生效并持久化（P1）。</div>
            </div>
            <div className="cf-row">
              <button
                className={theme === 'dark' ? 'cf-btn cf-btnGold cf-btnSmall' : 'cf-btn cf-btnSmall'}
                onClick={() => updateSettings({ theme: 'dark' })}
              >
                Dark
              </button>
              <button
                className={theme === 'light' ? 'cf-btn cf-btnGold cf-btnSmall' : 'cf-btn cf-btnSmall'}
                onClick={() => updateSettings({ theme: 'light' })}
              >
                Light
              </button>
            </div>
          </div>

          <div style={{ height: 10 }} />

          <div className="cf-row" style={{ alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div className="cf-sub">
                <strong style={{ color: 'var(--text)' }}>语言</strong>
              </div>
              <div className="cf-help">zh/en 即时切换（P1）。</div>
            </div>
            <div className="cf-row">
              <button
                className={language === 'zh' ? 'cf-btn cf-btnGold cf-btnSmall' : 'cf-btn cf-btnSmall'}
                onClick={() => updateSettings({ language: 'zh' })}
              >
                中文
              </button>
              <button
                className={language === 'en' ? 'cf-btn cf-btnGold cf-btnSmall' : 'cf-btn cf-btnSmall'}
                onClick={() => updateSettings({ language: 'en' })}
              >
                English
              </button>
            </div>
          </div>
        </div>

        <div className="cf-card cf-col6">
          <h3>OpenClaw 依赖</h3>
          <div className="cf-divider" />

          <div className="cf-sub">版本：{version || '未检测'}</div>
          <div style={{ height: 10 }} />

          <div className="cf-sub" style={{ marginBottom: 6 }}>
            OpenClaw 可执行路径
          </div>
          <div className="cf-row" style={{ alignItems: 'center' }}>
            <input
              className="cf-input"
              value={cliPath}
              onChange={(e) => setCliPath(e.target.value)}
              placeholder="例如：C:\\Program Files\\openclaw\\openclaw.exe"
              style={{ flex: 1 }}
            />
            <button
              className="cf-btn"
              onClick={() => (window as any).__cf_toast?.success?.('选择文件（示例）', '真实应用中会弹出文件选择器。')}
            >
              选择
            </button>
            <button
              className="cf-btn"
              onClick={() => (window as any).__cf_toast?.error?.('检测失败（示例）', '未找到 openclaw。请检查路径或安装。')}
            >
              检测
            </button>
          </div>
          {pathError ? <div className="cf-errorText" style={{ marginTop: 6 }}>{pathError}</div> : null}
          <div className="cf-help" style={{ marginTop: 6 }}>
            <a href="#/states" style={{ color: 'var(--gold)' }}>查看安装指引（示例）</a>
          </div>

          <div className="cf-divider" />

          <div className="cf-row" style={{ alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div className="cf-sub">
                <strong style={{ color: 'var(--text)' }}>自动启动 Gateway</strong>
              </div>
              <div className="cf-help">仅在依赖可用时启用。</div>
            </div>
            <button
              className={autoStartGateway ? 'cf-btn cf-btnGold cf-btnSmall' : 'cf-btn cf-btnSmall'}
              onClick={() => updateSettings({ autoStartGateway: !autoStartGateway })}
            >
              {autoStartGateway ? 'ON' : 'OFF'}
            </button>
          </div>
        </div>

        <div className="cf-card cf-col6">
          <h3>执行参数</h3>
          <div className="cf-divider" />
          <div className="cf-sub" style={{ marginBottom: 6 }}>
            命令超时（ms）
          </div>
          <input
            className="cf-input"
            value={timeoutMs}
            onChange={(e) => setTimeoutMs(Number(e.target.value || 0))}
          />
          <div className="cf-help">超时要可恢复：提示原因 + 下一步。</div>
          <div style={{ height: 10 }} />
          <div className="cf-sub" style={{ marginBottom: 6 }}>
            日志级别
          </div>
          <select
            className="cf-select"
            value={logLevel}
            onChange={(e) => updateSettings({ logLevel: e.target.value as any })}
          >
            <option value="debug">debug</option>
            <option value="info">info</option>
            <option value="warn">warn</option>
            <option value="error">error</option>
          </select>
          <div className="cf-help">debug 仅用于排障。</div>
        </div>

        <div className="cf-card cf-col6">
          <h3>安全与隐私</h3>
          <div className="cf-divider" />
          <div className="cf-sub">- Renderer 不直接拥有 Node 能力</div>
          <div className="cf-sub">- 只通过 preload 暴露最小 API</div>
          <div className="cf-sub">- 敏感字段默认脱敏，不写入日志明文</div>
          <div style={{ height: 12 }} />
          <button
            className="cf-btn cf-btnGold"
            onClick={() => (window as any).__cf_toast?.success?.('规则（示例）', 'token/key/password 仅展示尾 4 位，其余用 •••• 替代。')}
          >
            查看脱敏规则（示例）
          </button>
        </div>
      </section>
    </>
  );
};

export default SettingsPage;

