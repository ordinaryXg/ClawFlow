import { FC, useEffect, useMemo, useState } from 'react';
import { Alert, Button, Empty, Input, Space, Typography, message as antdMessage } from 'antd';
import { PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import { Connector, ConnectorConfig, useConnectorStore } from '../../store/modules/connectorStore';
import ConnectorList from '../../components/connector/ConnectorList';
import ConnectorForm from '../../components/connector/ConnectorForm';
import './styles.css';

const { Title, Text } = Typography;

const ConnectorsPage: FC = () => {
  const { connectors, isLoading, error, fetchConnectors, addConnector, updateConnector, deleteConnector, testConnection, setError } =
    useConnectorStore();

  const [query, setQuery] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Connector | null>(null);

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

  const onNew = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const onEdit = (connector: Connector) => {
    setEditing(connector);
    setFormOpen(true);
  };

  const onSubmit = async (values: ConnectorConfig) => {
    if (editing) {
      await updateConnector(editing.id, values);
      antdMessage.success('已更新连接器');
    } else {
      await addConnector(values);
      antdMessage.success('已添加连接器');
    }
    setFormOpen(false);
    setEditing(null);
  };

  const onDelete = async (id: string) => {
    await deleteConnector(id);
    antdMessage.success('已删除连接器');
  };

  const onTest = async (id: string) => {
    const ok = await testConnection(id);
    if (ok) antdMessage.success('连接测试成功');
    else antdMessage.error('连接测试失败');
  };

  return (
    <div className="cf-connectorsPage">
      <div className="cf-connectorsPage__header">
        <div className="cf-connectorsPage__title">
          <Title level={3} style={{ margin: 0 }}>
            连接器
          </Title>
          <Text type="secondary">配置并管理 OpenClaw 连接器</Text>
        </div>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={() => void fetchConnectors()} loading={isLoading}>
            刷新
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={onNew}>
            添加连接器
          </Button>
        </Space>
      </div>

      {error ? (
        <Alert
          type="error"
          showIcon
          message="操作失败"
          description={
            <Space size={8} wrap>
              <span>{error}</span>
              <Button size="small" type="link" onClick={() => setError(null)}>
                清除
              </Button>
            </Space>
          }
          style={{ marginBottom: 12 }}
        />
      ) : null}

      <div className="cf-connectorsPage__toolbar">
        <Input placeholder="搜索名称/类型/配置" value={query} onChange={(e) => setQuery(e.target.value)} allowClear />
      </div>

      <div className="cf-connectorsPage__content">
        {filtered.length === 0 ? (
          <div className="cf-connectorsPage__empty">
            <Empty description="暂无连接器" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            <Button type="primary" icon={<PlusOutlined />} onClick={onNew}>
              添加第一个连接器
            </Button>
          </div>
        ) : (
          <ConnectorList
            connectors={filtered}
            loading={isLoading}
            onEdit={onEdit}
            onDelete={(id) => void onDelete(id)}
            onTest={(id) => void onTest(id)}
          />
        )}
      </div>

      <ConnectorForm
        open={formOpen}
        initial={editing}
        loading={isLoading}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
        onSubmit={(v) => void onSubmit(v)}
      />
    </div>
  );
};

export default ConnectorsPage;

