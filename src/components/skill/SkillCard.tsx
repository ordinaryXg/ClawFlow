import { FC, useMemo } from 'react';
import { Button, Card, Space, Switch, Tag, Typography, message as antdMessage } from 'antd';
import { CloudDownloadOutlined, DeleteOutlined } from '@ant-design/icons';
import { Skill, useSkillStore } from '../../store/modules/skillStore';
import './skill.css';

const { Text } = Typography;

interface Props {
  skill: Skill;
}

const SkillCard: FC<Props> = ({ skill }) => {
  const { isLoading, installSkill, uninstallSkill, enableSkill, disableSkill } = useSkillStore();

  const statusTag = useMemo(() => {
    if (!skill.installed) return <Tag>未安装</Tag>;
    return skill.enabled ? <Tag color="green">已启用</Tag> : <Tag color="gold">已安装</Tag>;
  }, [skill.enabled, skill.installed]);

  const onInstall = async () => {
    try {
      await installSkill(skill.name);
      antdMessage.success(`已安装 ${skill.name}`);
    } catch (e: any) {
      antdMessage.error(e?.message || '安装失败');
    }
  };

  const onUninstall = async () => {
    try {
      await uninstallSkill(skill.name);
      antdMessage.success(`已卸载 ${skill.name}`);
    } catch (e: any) {
      antdMessage.error(e?.message || '卸载失败');
    }
  };

  const onToggleEnabled = async (checked: boolean) => {
    try {
      if (checked) {
        await enableSkill(skill.name);
        antdMessage.success(`已启用 ${skill.name}`);
      } else {
        await disableSkill(skill.name);
        antdMessage.success(`已禁用 ${skill.name}`);
      }
    } catch (e: any) {
      antdMessage.error(e?.message || '操作失败');
    }
  };

  return (
    <Card
      size="small"
      className="cf-skillCard"
      title={
        <Space size={10} wrap>
          <Text strong>{skill.name}</Text>
          <Text type="secondary">v{skill.version}</Text>
          {statusTag}
        </Space>
      }
    >
      <div className="cf-skillCard__body">
        <div className="cf-skillCard__desc">
          <Text type="secondary">{skill.description || '暂无描述'}</Text>
        </div>

        <div className="cf-skillCard__actions">
          <Space size={10} wrap>
            <Space size={6}>
              <Text type="secondary">启用</Text>
              <Switch
                size="small"
                checked={skill.enabled}
                disabled={!skill.installed || isLoading}
                onChange={(checked) => void onToggleEnabled(checked)}
              />
            </Space>

            {!skill.installed ? (
              <Button
                type="primary"
                icon={<CloudDownloadOutlined />}
                loading={isLoading}
                onClick={() => void onInstall()}
              >
                安装
              </Button>
            ) : (
              <Button
                danger
                icon={<DeleteOutlined />}
                loading={isLoading}
                onClick={() => void onUninstall()}
              >
                卸载
              </Button>
            )}
          </Space>
        </div>
      </div>
    </Card>
  );
};

export default SkillCard;

