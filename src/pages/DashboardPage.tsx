import { FC, useEffect, useState } from 'react';

const DashboardPage: FC = () => {
  const [version, setVersion] = useState<string>('');
  const [gatewayStatus, setGatewayStatus] = useState<'running' | 'stopped' | 'unknown'>('unknown');
  const [error, setError] = useState<string>('');
  const [cliAvailable, setCliAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    console.log('[Dashboard] 组件挂载，开始获取初始数据');
    
    // 首先检查 OpenClaw CLI 是否可用
    if (window.electronAPI?.validateCLI) {
      console.log('[Dashboard] 正在检查 OpenClaw CLI 可用性...');
      window.electronAPI.validateCLI().then((available: boolean) => {
        console.log('[Dashboard] OpenClaw CLI 可用性:', available);
        setCliAvailable(available);
        
        if (!available) {
          setError('OpenClaw CLI 未安装或不在 PATH 中');
          setVersion('');
        }
      }).catch((err) => {
        console.error('[Dashboard] 检查 CLI 可用性失败:', err);
        setCliAvailable(false);
        setError('无法检查 OpenClaw CLI 状态');
      });
    }

    // 调用主进程获取 OpenClaw 版本
    if (window.electronAPI?.getVersion) {
      console.log('[Dashboard] 正在获取 OpenClaw 版本...');
      window.electronAPI.getVersion().then((ver: string) => {
        console.log('[Dashboard] 获取版本成功:', ver);
        setVersion(ver);
        setError('');
      }).catch((err) => {
        console.error('[Dashboard] 获取版本失败:', err);
        setVersion('');
        setError(`版本获取失败: ${err.message || '未知错误'}`);
      });
    } else {
      console.error('[Dashboard] electronAPI.getVersion 不存在');
      setError('electronAPI.getVersion 不可用');
    }

    // 获取 Gateway 状态
    if (window.electronAPI?.getGatewayStatus) {
      console.log('[Dashboard] 正在获取 Gateway 状态...');
      window.electronAPI.getGatewayStatus().then((status: string) => {
        console.log('[Dashboard] 获取 Gateway 状态成功:', status);
        setGatewayStatus(status as 'running' | 'stopped' | 'unknown');
      }).catch((err) => {
        console.error('[Dashboard] 获取 Gateway 状态失败:', err);
        setGatewayStatus('unknown');
      });
    }
  }, []);

  const handleStartGateway = () => {
    if (window.electronAPI?.startGateway) {
      window.electronAPI.startGateway().then(() => {
        setGatewayStatus('running');
      }).catch((err) => {
        console.error('[Dashboard] 启动 Gateway 失败:', err);
        setError(`启动 Gateway 失败: ${err.message || '未知错误'}`);
      });
    }
  };

  const handleStopGateway = () => {
    if (window.electronAPI?.stopGateway) {
      window.electronAPI.stopGateway().then(() => {
        setGatewayStatus('stopped');
      }).catch((err) => {
        console.error('[Dashboard] 停止 Gateway 失败:', err);
        setError(`停止 Gateway 失败: ${err.message || '未知错误'}`);
      });
    }
  };

  return (
    <div>
      <h1>仪表盘</h1>
      
      {cliAvailable === false && (
        <div style={{
          background: '#fff3cd',
          border: '1px solid #ffc107',
          borderRadius: 8,
          padding: 16,
          marginBottom: 16,
          color: '#856404',
        }}>
          <h3 style={{ marginTop: 0 }}>⚠️ OpenClaw CLI 未安装</h3>
          <p>未检测到 OpenClaw CLI。请确保：</p>
          <ol style={{ marginBottom: 8 }}>
            <li>OpenClaw 已正确安装</li>
            <li>OpenClaw CLI 在系统 PATH 中可用</li>
            <li>可以在终端中运行 <code>openclaw --version</code> 验证</li>
          </ol>
          <p style={{ marginBottom: 0 }}>
            <strong>提示：</strong>安装 OpenClaw 后，重启应用即可正常使用。
          </p>
        </div>
      )}
      
      {error && cliAvailable !== false && (
        <div style={{
          background: '#fee',
          border: '1px solid #c00',
          borderRadius: 8,
          padding: 16,
          marginBottom: 16,
          color: '#c00',
        }}>
          <strong>错误：</strong> {error}
        </div>
      )}
      
      <div style={{
        background: '#f9f9f9',
        border: '1px solid #e0e0e0',
        borderRadius: 8,
        padding: 16,
        marginBottom: 16,
      }}>
        <h3 style={{ marginTop: 0 }}>OpenClaw 状态</h3>
        <p><strong>版本：</strong> {
          cliAvailable === false 
            ? '未安装' 
            : (version || (error ? '获取失败' : '检测中...'))
        }</p>
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
          disabled={gatewayStatus === 'running' || cliAvailable === false}
          style={{
            padding: '8px 16px',
            background: (gatewayStatus === 'running' || cliAvailable === false) ? '#ccc' : '#007acc',
            color: 'white',
            border: 'none',
            borderRadius: 4,
            cursor: (gatewayStatus === 'running' || cliAvailable === false) ? 'not-allowed' : 'pointer',
          }}
        >
          启动 Gateway
        </button>
        <button
          onClick={handleStopGateway}
          disabled={gatewayStatus === 'stopped' || cliAvailable === false}
          style={{
            padding: '8px 16px',
            background: (gatewayStatus === 'stopped' || cliAvailable === false) ? '#ccc' : '#cc0000',
            color: 'white',
            border: 'none',
            borderRadius: 4,
            cursor: (gatewayStatus === 'stopped' || cliAvailable === false) ? 'not-allowed' : 'pointer',
          }}
        >
          停止 Gateway
        </button>
      </div>
    </div>
  );
};

export default DashboardPage;
