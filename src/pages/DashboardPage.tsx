import { FC, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, Button, Card, Col, Row, Space, Statistic, Tag, Typography } from 'antd';
import {
  ApiOutlined,
  ArrowRightOutlined,
  PlayCircleOutlined,
  PoweroffOutlined,
  RocketOutlined,
  SettingOutlined,
  ToolOutlined,
} from '@ant-design/icons';
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

  const gatewayStatusTag = useMemo(() => {
    if (gatewayStatus === 'running') return <Tag color="green">运行中</Tag>;
    if (gatewayStatus === 'stopped') return <Tag color="red">已停止</Tag>;
    return <Tag color="default">未知</Tag>;
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
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Space align="baseline" style={{ justifyContent: 'space-between', width: '100%' }}>
        <Typography.Title level={2} style={{ margin: 0 }}>
          仪表盘
        </Typography.Title>
        <Button
          icon={<RocketOutlined />}
          onClick={() => {
            fetchVersion();
            fetchStatus();
            fetchSkills();
            fetchConnectors();
          }}
        >
          刷新
        </Button>
      </Space>

      {cliAvailable === false && (
        <Alert
          type="warning"
          showIcon
          message="未检测到 OpenClaw CLI"
          description={
            <div>
              <div style={{ marginBottom: 8 }}>{cliError || 'OpenClaw CLI 未安装或不在 PATH 中。'}</div>
              <div>
                请在终端运行 <code>openclaw --version</code> 验证；安装完成后重启应用即可正常使用。
              </div>
            </div>
          }
        />
      )}

      {(gatewayError || skillError || connectorError) && cliAvailable !== false && (
        <Alert
          type="error"
          showIcon
          message="部分信息加载失败"
          description={
            <div>
              {gatewayError && <div>Gateway：{gatewayError}</div>}
              {skillError && <div>技能：{skillError}</div>}
              {connectorError && <div>连接器：{connectorError}</div>}
            </div>
          }
        />
      )}

      <Row gutter={[16, 16]}>
        <Col xs={24} md={12} lg={6}>
          <Card>
            <Statistic
              title="OpenClaw 版本"
              value={cliAvailable === false ? '未安装' : version || '检测中'}
              prefix={<ApiOutlined />}
            />
          </Card>
        </Col>

        <Col xs={24} md={12} lg={6}>
          <Card>
            <Space direction="vertical" size={4} style={{ width: '100%' }}>
              <div style={{ color: 'rgba(0, 0, 0, 0.45)' }}>Gateway 状态</div>
              <Space>
                {gatewayStatusTag}
                <Typography.Text type="secondary">
                  {isStarting ? '启动中…' : isStopping ? '停止中…' : ''}
                </Typography.Text>
              </Space>
              <Space>
                <Button
                  type="primary"
                  icon={<PlayCircleOutlined />}
                  loading={isStarting}
                  disabled={!canOperateGateway || gatewayStatus === 'running' || isStopping}
                  onClick={handleStartGateway}
                >
                  启动
                </Button>
                <Button
                  danger
                  icon={<PoweroffOutlined />}
                  loading={isStopping}
                  disabled={!canOperateGateway || gatewayStatus === 'stopped' || isStarting}
                  onClick={handleStopGateway}
                >
                  停止
                </Button>
              </Space>
            </Space>
          </Card>
        </Col>

        <Col xs={24} md={12} lg={6}>
          <Card>
            <Statistic
              title="技能（已安装 / 已启用）"
              value={`${installedSkillsCount} / ${enabledSkillsCount}`}
              prefix={<ToolOutlined />}
              suffix={isSkillLoading ? '加载中…' : ''}
            />
          </Card>
        </Col>

        <Col xs={24} md={12} lg={6}>
          <Card>
            <Statistic
              title="连接器数量"
              value={connectorsCount}
              prefix={<ApiOutlined />}
              suffix={isConnectorLoading ? '加载中…' : ''}
            />
          </Card>
        </Col>
      </Row>

      <Card title="快捷入口" extra={<Typography.Text type="secondary">快速进入常用功能</Typography.Text>}>
        <Space wrap>
          <Button icon={<ArrowRightOutlined />} onClick={() => navigate('/chat')}>
            打开对话
          </Button>
          <Button icon={<ToolOutlined />} onClick={() => navigate('/skills')}>
            技能管理
          </Button>
          <Button icon={<ApiOutlined />} onClick={() => navigate('/connectors')}>
            连接器
          </Button>
          <Button icon={<SettingOutlined />} disabled>
            设置（未接入路由）
          </Button>
        </Space>
      </Card>
    </Space>
  );
};

export default DashboardPage;
