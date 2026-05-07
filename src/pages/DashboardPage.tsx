import { FC, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useConnectorStore } from '../store/modules/connectorStore';
import { useGatewayStore } from '../store/modules/gatewayStore';
import { useSkillStore } from '../store/modules/skillStore';

const DashboardPage: FC = () => {
  const [cliAvailable, setCliAvailable] = useState<boolean | null>(null);
  const [cliError, setCliError] = useState<string>('');

  const navigate = useNavigate();

  const {
    status: gatewayStatus,
    version,
    isStarting,
    isStopping,
    error: gatewayError,
    fetchStatus,
    fetchVersion,
    startGateway,
    stopGateway,
  } = useGatewayStore();

  const { skills, fetchSkills, error: skillError, isLoading: isSkillLoading } = useSkillStore();
  const {
    connectors,
    fetchConnectors,
    error: connectorError,
    isLoading: isConnectorLoading,
  } = useConnectorStore();

  const installedSkillsCount = useMemo(
    () => skills.filter((s) => s.installed).length,
    [skills]
  );
  const enabledSkillsCount = useMemo(() => skills.filter((s) => s.enabled).length, [skills]);
  const connectorsCount = connectors.length;

  useEffect(() => {
    // 首先检查 OpenClaw CLI 是否可用
    if (window.electronAPI?.validateCLI) {
      window.electronAPI
        .validateCLI()
        .then((available: boolean) => {
          setCliAvailable(available);
          setCliError(available ? '' : 'OpenClaw CLI 未安装或不在 PATH 中');
        })
        .catch(() => {
          setCliAvailable(false);
          setCliError('无法检查 OpenClaw CLI 状态');
        });
    }

    // 刷新仪表盘核心数据
    fetchVersion();
    fetchStatus();
    fetchSkills();
    fetchConnectors();
  }, []);

  const gatewayChip = useMemo(() => {
    if (gatewayStatus === 'running') return <span className="cf-chip cf-chipRunning">Running</span>;
    if (gatewayStatus === 'stopped') return <span className="cf-chip cf-chipStopped">Stopped</span>;
    return <span className="cf-chip cf-chipUnknown">Unknown</span>;
  }, [gatewayStatus]);

  const canOperateGateway = cliAvailable !== false;

  const handleStartGateway = async () => {
    if (!canOperateGateway) return;
    await startGateway();
    await fetchStatus();
  };

  const handleStopGateway = async () => {
    if (!canOperateGateway) return;
    await stopGateway();
    await fetchStatus();
  };

  return (
    <>
      <div className="cf-topbar">
        <div className="cf-pageTitle">
          <h2>Dashboard</h2>
          <p>快速查看依赖与服务状态，并进入关键模块。</p>
        </div>
        <div className="cf-row">
          <button
            className="cf-btn cf-btnGhost"
            onClick={() => {
              fetchVersion();
              fetchStatus();
              fetchSkills();
              fetchConnectors();
              (window as any).__cf_toast?.success?.('已刷新', '状态与列表已更新（示例）。');
            }}
          >
            刷新
          </button>
        </div>
      </div>

      {cliAvailable === false ? (
        <div className="cf-banner">
          <div>
            <b>未检测到 OpenClaw</b>
            <span>{cliError || 'OpenClaw CLI 未安装或不在 PATH 中。'}</span>
          </div>
          <button className="cf-btn cf-btnGold" onClick={() => navigate('/settings')}>
            去设置路径
          </button>
        </div>
      ) : null}

      {(gatewayError || skillError || connectorError) && cliAvailable !== false ? (
        <div
          className="cf-banner"
          style={{
            marginTop: 12,
            borderColor: 'rgba(194,75,75,.45)',
            background: 'rgba(194,75,75,.10)',
          }}
        >
          <div>
            <b>部分信息加载失败</b>
            <span>
              {gatewayError ? `Gateway：${gatewayError} ` : ''}
              {skillError ? `技能：${skillError} ` : ''}
              {connectorError ? `连接器：${connectorError}` : ''}
            </span>
          </div>
          <button className="cf-btn cf-btnDanger" onClick={() => (window as any).__cf_toast?.error?.('提示', '请检查依赖后重试。')}>
            查看建议
          </button>
        </div>
      ) : null}

      <section className="cf-grid" style={{ marginTop: 12 }}>
        <div className="cf-card cf-col4">
          <h3>OpenClaw 版本</h3>
          <div className="cf-row" style={{ alignItems: 'center', justifyContent: 'space-between' }}>
            <span className="cf-sub">{cliAvailable === false ? '未安装' : version || '检测中'}</span>
            <button className="cf-btn cf-btnSmall" onClick={() => void fetchVersion()}>
              重新检测
            </button>
          </div>
          <div className="cf-divider" />
          <div className="cf-sub">若缺失依赖：请前往 Settings → OpenClaw Path。</div>
        </div>

        <div className="cf-card cf-col8">
          <h3>Gateway 状态</h3>
          <div className="cf-row" style={{ alignItems: 'center', justifyContent: 'space-between' }}>
            <div className="cf-row" style={{ alignItems: 'center', gap: 10 }}>
              {gatewayChip}
              <span className="cf-sub">
                {isStarting ? '启动中…' : isStopping ? '停止中…' : '以 status 命令为事实来源'}
              </span>
            </div>
            <div className="cf-row">
              <button className="cf-btn" onClick={() => void fetchStatus()}>
                刷新状态
              </button>
              <button
                className="cf-btn cf-btnPrimary"
                disabled={!canOperateGateway || gatewayStatus === 'running' || isStopping || isStarting}
                onClick={() => void handleStartGateway()}
              >
                启动 Gateway
              </button>
              <button
                className="cf-btn cf-btnDanger"
                disabled={!canOperateGateway || gatewayStatus === 'stopped' || isStopping || isStarting}
                onClick={() => void handleStopGateway()}
              >
                停止
              </button>
            </div>
          </div>

          <div className="cf-divider" />

          <div className="cf-grid">
            <div className="cf-card cf-col4">
              <h3>概览</h3>
              <div className="cf-sub">技能（已安装/已启用）：{installedSkillsCount} / {enabledSkillsCount}{isSkillLoading ? ' · 加载中…' : ''}</div>
              <div className="cf-sub">连接器数量：{connectorsCount}{isConnectorLoading ? ' · 加载中…' : ''}</div>
            </div>
            <div className="cf-card cf-col8">
              <h3>快捷入口</h3>
              <div className="cf-row">
                <button className="cf-btn cf-btnPrimary" onClick={() => navigate('/chat')}>
                  进入 Chat
                </button>
                <button className="cf-btn" onClick={() => navigate('/skills')}>
                  管理 Skills
                </button>
                <button className="cf-btn" onClick={() => navigate('/connectors')}>
                  管理 Connectors
                </button>
                <button className="cf-btn" onClick={() => navigate('/settings')}>
                  打开 Settings
                </button>
              </div>
              <div className="cf-help">目标：新用户 5 分钟内完成一次对话并得到反馈（含降级提示）。</div>
            </div>
          </div>
        </div>

        <div className="cf-card cf-col12">
          <h3>系统概览</h3>
          <div className="cf-sub">用一句话告诉用户“现在是否可用”以及“下一步做什么”。</div>
          <div className="cf-divider" />
          <div className="cf-grid">
            <div className="cf-card cf-col4">
              <h3>Chat</h3>
              <div className="cf-sub">发送消息 → 流式回复 → 失败可重试</div>
              <button className="cf-btn cf-btnSmall" onClick={() => navigate('/chat')}>去对话</button>
            </div>
            <div className="cf-card cf-col4">
              <h3>Skills</h3>
              <div className="cf-sub">安装/卸载/启用/禁用 + 统一反馈</div>
              <button className="cf-btn cf-btnSmall" onClick={() => navigate('/skills')}>去技能</button>
            </div>
            <div className="cf-card cf-col4">
              <h3>Connectors</h3>
              <div className="cf-sub">新增/编辑/删除 + 测试连接 + 脱敏</div>
              <button className="cf-btn cf-btnSmall" onClick={() => navigate('/connectors')}>去连接器</button>
            </div>
          </div>
        </div>
      </section>
    </>
  );
};

export default DashboardPage;
