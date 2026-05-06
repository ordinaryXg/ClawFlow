import { FC, useEffect, useState } from 'react';

const DashboardPage: FC = () => {
  const [version, setVersion] = useState<string>('');
  const [gatewayStatus, setGatewayStatus] = useState<'running' | 'stopped' | 'unknown'>('unknown');

  useEffect(() => {
    // 调用主进程获取 OpenClaw 版本
    if (window.electronAPI?.getVersion) {
      window.electronAPI.getVersion().then((ver: string) => {
        setVersion(ver);
      }).catch(() => {
        setVersion('未安装');
      });
    }

    // 获取 Gateway 状态
    if (window.electronAPI?.getGatewayStatus) {
      window.electronAPI.getGatewayStatus().then((status: string) => {
        setGatewayStatus(status as 'running' | 'stopped' | 'unknown');
      }).catch(() => {
        setGatewayStatus('unknown');
      });
    }
  }, []);

  const handleStartGateway = () => {
    if (window.electronAPI?.startGateway) {
      window.electronAPI.startGateway().then(() => {
        setGatewayStatus('running');
      });
    }
  };

  const handleStopGateway = () => {
    if (window.electronAPI?.stopGateway) {
      window.electronAPI.stopGateway().then(() => {
        setGatewayStatus('stopped');
      });
    }
  };

  return (
    <div>
      <h1>仪表盘</h1>
      
      <div style={{
        background: '#f9f9f9',
        border: '1px solid #e0e0e0',
        borderRadius: 8,
        padding: 16,
        marginBottom: 16,
      }}>
        <h3 style={{ marginTop: 0 }}>OpenClaw 状态</h3>
        <p><strong>版本：</strong> {version || '检测中...'}</p>
        <p>
          <strong>Gateway 状态：</strong>
          <span style={{
            color: gatewayStatus === 'running' ? 'green' : gatewayStatus === 'stopped' ? 'red' : '#999',
            fontWeight: 'bold',
          }}>
            {gatewayStatus === 'running' ? '运行中' : gatewayStatus === 'stopped' ? '已停止' : '未知'}
          </span>
        </p>
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={handleStartGateway}
          disabled={gatewayStatus === 'running'}
          style={{
            padding: '8px 16px',
            background: gatewayStatus === 'running' ? '#ccc' : '#007acc',
            color: 'white',
            border: 'none',
            borderRadius: 4,
            cursor: gatewayStatus === 'running' ? 'not-allowed' : 'pointer',
          }}
        >
          启动 Gateway
        </button>
        <button
          onClick={handleStopGateway}
          disabled={gatewayStatus === 'stopped'}
          style={{
            padding: '8px 16px',
            background: gatewayStatus === 'stopped' ? '#ccc' : '#cc0000',
            color: 'white',
            border: 'none',
            borderRadius: 4,
            cursor: gatewayStatus === 'stopped' ? 'not-allowed' : 'pointer',
          }}
        >
          停止 Gateway
        </button>
      </div>
    </div>
  );
};

export default DashboardPage;
