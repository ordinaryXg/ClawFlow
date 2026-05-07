import { FC, useMemo } from 'react';
import { Button, Card, Popconfirm, Space, Tag, Typography } from 'antd';
import { DeleteOutlined, EditOutlined, ApiOutlined, ExperimentOutlined } from '@ant-design/icons';
import { Connector } from '../../store/modules/connectorStore';
import './connector.css';

const { Text } = Typography;

interface Props {
  connector: Connector;
  onEdit: () => void;
  onDelete: () => void;
  onTest: () => void;
}

const ConnectorCard: FC<Props> = ({ connector, onEdit, onDelete, onTest }) => {
  const statusTag = useMemo(() => {
    if (connector.status === 'connected') return <Tag color="green">已连接</Tag>;
    if (connector.status === 'error') return <Tag color="red">异常</Tag>;
    return <Tag>未连接</Tag>;
  }, [connector.status]);

  const maskedConfig = useMemo(() => {
    const cfg = connector.config ?? {};
    const safe: Record<string, any> = {};
    Object.keys(cfg).forEach((k) => {
      const v = (cfg as any)[k];
      const keyLower = k.toLowerCase();
      if (keyLower.includes('token') || keyLower.includes('secret') || keyLower.includes('password') || keyLower.includes('key')) {
        safe[k] = '***';
      } else {
        safe[k] = v;
      }
    });
    return safe;
  }, [connector.config]);

  return (
    <Card
      size="small"
      className="cf-connectorCard"
      title={
        <Space size={10} wrap>
          <Space size={6}>
            <ApiOutlined />
            <Text strong>{connector.name}</Text>
          </Space>
          <Tag color="blue">{connector.type}</Tag>
          {statusTag}
        </Space>
      }
      extra={
        <Space>
          <Button icon={<ExperimentOutlined />} onClick={onTest}>
            测试连接
          </Button>
          <Button icon={<EditOutlined />} onClick={onEdit}>
            编辑
          </Button>
          <Popconfirm title="确认删除该连接器？" okText="删除" cancelText="取消" onConfirm={onDelete}>
            <Button danger icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      }
    >
      <div className="cf-connectorCard__meta">
        <Text type="secondary">配置：</Text>
        <pre className="cf-connectorCard__config">{JSON.stringify(maskedConfig, null, 2)}</pre>
      </div>
    </Card>
  );
};

export default ConnectorCard;

