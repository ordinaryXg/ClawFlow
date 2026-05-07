import { FC, useEffect, useMemo, useState } from 'react';
import { Alert, Button, Empty, Input, Segmented, Space, Typography } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { Skill, useSkillStore } from '../../store/modules/skillStore';
import SkillList from '../../components/skill/SkillList';
import './styles.css';

const { Title, Text } = Typography;

type FilterMode = 'all' | 'installed' | 'notInstalled';

const SkillsPage: FC = () => {
  const { skills, isLoading, error, fetchSkills, setError } = useSkillStore();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FilterMode>('all');

  useEffect(() => {
    void fetchSkills();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return skills
      .filter((s) => {
        if (filter === 'installed') return s.installed;
        if (filter === 'notInstalled') return !s.installed;
        return true;
      })
      .filter((s) => {
        if (!q) return true;
        return (
          s.name.toLowerCase().includes(q) ||
          s.description.toLowerCase().includes(q) ||
          s.version.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        // 已安装优先，其次按名称
        if (a.installed !== b.installed) return a.installed ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
  }, [skills, query, filter]);

  return (
    <div className="cf-skillsPage">
      <div className="cf-skillsPage__header">
        <div className="cf-skillsPage__title">
          <Title level={3} style={{ margin: 0 }}>
            技能管理
          </Title>
          <Text type="secondary">安装、启用并管理 OpenClaw 技能</Text>
        </div>
        <Button icon={<ReloadOutlined />} onClick={() => void fetchSkills()} loading={isLoading}>
          刷新
        </Button>
      </div>

      {error ? (
        <Alert
          type="error"
          showIcon
          message="加载失败"
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

      <div className="cf-skillsPage__toolbar">
        <Input
          placeholder="搜索技能名称/描述/版本"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          allowClear
        />
        <Segmented
          value={filter}
          onChange={(v) => setFilter(v as FilterMode)}
          options={[
            { label: '全部', value: 'all' },
            { label: '已安装', value: 'installed' },
            { label: '未安装', value: 'notInstalled' },
          ]}
        />
      </div>

      <div className="cf-skillsPage__content">
        {filtered.length === 0 ? (
          <div className="cf-skillsPage__empty">
            <Empty description="没有匹配的技能" image={Empty.PRESENTED_IMAGE_SIMPLE} />
          </div>
        ) : (
          <SkillList skills={filtered as Skill[]} loading={isLoading} />
        )}
      </div>
    </div>
  );
};

export default SkillsPage;

