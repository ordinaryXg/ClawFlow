import { FC } from 'react';
import { List, Skeleton } from 'antd';
import { Skill } from '../../store/modules/skillStore';
import SkillCard from './SkillCard';
import './skill.css';

interface Props {
  skills: Skill[];
  loading?: boolean;
}

const SkillList: FC<Props> = ({ skills, loading }) => {
  return (
    <List
      className="cf-skillList"
      itemLayout="horizontal"
      dataSource={skills}
      loading={loading}
      renderItem={(skill) => (
        <List.Item>
          {loading ? <Skeleton active /> : <SkillCard skill={skill} />}
        </List.Item>
      )}
    />
  );
};

export default SkillList;

