import { FC } from 'react';
import { Descriptions, Modal, Typography } from 'antd';
import { Skill } from '../../store/modules/skillStore';

const { Paragraph, Text } = Typography;

interface Props {
  open: boolean;
  onClose: () => void;
  skill: Skill | null;
}

const SkillDetail: FC<Props> = ({ open, onClose, skill }) => {
  return (
    <Modal open={open} onCancel={onClose} onOk={onClose} okText="关闭" cancelButtonProps={{ style: { display: 'none' } }} title="技能详情">
      {!skill ? (
        <Text type="secondary">未选择技能</Text>
      ) : (
        <>
          <Descriptions size="small" column={1} bordered>
            <Descriptions.Item label="名称">{skill.name}</Descriptions.Item>
            <Descriptions.Item label="版本">{skill.version}</Descriptions.Item>
            <Descriptions.Item label="已安装">{skill.installed ? '是' : '否'}</Descriptions.Item>
            <Descriptions.Item label="已启用">{skill.enabled ? '是' : '否'}</Descriptions.Item>
          </Descriptions>
          <Paragraph style={{ marginTop: 12 }}>
            <Text type="secondary">{skill.description || '暂无描述'}</Text>
          </Paragraph>
        </>
      )}
    </Modal>
  );
};

export default SkillDetail;

