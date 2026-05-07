import { FC } from 'react';
import { List, Skeleton } from 'antd';
import { Connector } from '../../store/modules/connectorStore';
import ConnectorCard from './ConnectorCard';
import './connector.css';

interface Props {
  connectors: Connector[];
  loading?: boolean;
  onEdit: (connector: Connector) => void;
  onDelete: (id: string) => void;
  onTest: (id: string) => void;
}

const ConnectorList: FC<Props> = ({ connectors, loading, onEdit, onDelete, onTest }) => {
  return (
    <List
      className="cf-connectorList"
      itemLayout="vertical"
      dataSource={connectors}
      loading={loading}
      renderItem={(connector) => (
        <List.Item>
          {loading ? (
            <Skeleton active />
          ) : (
            <ConnectorCard
              connector={connector}
              onEdit={() => onEdit(connector)}
              onDelete={() => onDelete(connector.id)}
              onTest={() => onTest(connector.id)}
            />
          )}
        </List.Item>
      )}
    />
  );
};

export default ConnectorList;

