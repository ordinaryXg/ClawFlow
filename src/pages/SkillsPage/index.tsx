import { FC, useEffect, useMemo, useState } from 'react';
import { Skill, useSkillStore } from '../../store/modules/skillStore';
import './styles.css';

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
      <div className="cf-topbar">
        <div className="cf-pageTitle">
          <h2>Skills</h2>
          <p>搜索/筛选 · 安装/卸载 · 启用/禁用 · 统一反馈。</p>
        </div>
        <div className="cf-row">
          <button className="cf-btn cf-btnGhost" onClick={() => void fetchSkills()}>
            {isLoading ? '刷新中…' : '刷新'}
          </button>
        </div>
      </div>

      {error ? (
        <div className="cf-banner" style={{ borderColor: 'rgba(194,75,75,.45)', background: 'rgba(194,75,75,.10)' }}>
          <div>
            <b>加载失败</b>
            <span>{error}</span>
          </div>
          <button className="cf-btn cf-btnGhost" onClick={() => setError(null)}>
            清除
          </button>
        </div>
      ) : null}

      <div className="cf-card" style={{ marginTop: 12 }}>
        <div className="cf-row" style={{ alignItems: 'center', justifyContent: 'space-between' }}>
          <div className="cf-row" style={{ alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <input
              className="cf-input"
              style={{ width: 320 }}
              placeholder="搜索技能（名称/描述/版本）"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <div className="cf-row">
              <button
                className={filter === 'all' ? 'cf-btn cf-btnGold cf-btnSmall' : 'cf-btn cf-btnSmall'}
                onClick={() => setFilter('all')}
              >
                全部
              </button>
              <button
                className={filter === 'installed' ? 'cf-btn cf-btnGold cf-btnSmall' : 'cf-btn cf-btnSmall'}
                onClick={() => setFilter('installed')}
              >
                已安装
              </button>
              <button
                className={filter === 'notInstalled' ? 'cf-btn cf-btnGold cf-btnSmall' : 'cf-btn cf-btnSmall'}
                onClick={() => setFilter('notInstalled')}
              >
                未安装
              </button>
            </div>
          </div>
          <span className="cf-sub">共 {filtered.length} 项</span>
        </div>
      </div>

      <div style={{ height: 12 }} />

      {filtered.length === 0 ? (
        <div className="cf-card">
          <h3>无匹配技能</h3>
          <div className="cf-sub">尝试清空搜索条件或切换筛选。</div>
          <div style={{ height: 12 }} />
          <button className="cf-btn cf-btnPrimary" onClick={() => setQuery('')}>
            清空搜索
          </button>
        </div>
      ) : (
        <div className="cf-grid">
          {(filtered as Skill[]).map((s) => (
            <SkillCard key={s.name} skill={s} />
          ))}
        </div>
      )}
    </div>
  );
};

export default SkillsPage;

const SkillCard: FC<{ skill: Skill }> = ({ skill }) => {
  const { installSkill, uninstallSkill, enableSkill, disableSkill, isLoading } = useSkillStore();

  const onInstall = async () => {
    try {
      await installSkill(skill.name);
      (window as any).__cf_toast?.success?.('安装成功', `技能 ${skill.name} 已安装。`);
    } catch (e: any) {
      (window as any).__cf_toast?.error?.('安装失败', e?.message || '请稍后重试。');
    }
  };

  const onUninstall = async () => {
    try {
      await uninstallSkill(skill.name);
      (window as any).__cf_toast?.success?.('已卸载', `技能 ${skill.name} 已移除。`);
    } catch (e: any) {
      (window as any).__cf_toast?.error?.('卸载失败', e?.message || '请稍后重试。');
    }
  };

  const onToggle = async () => {
    if (!skill.installed) return;
    try {
      if (skill.enabled) {
        await disableSkill(skill.name);
        (window as any).__cf_toast?.success?.('已禁用', `技能 ${skill.name} 已禁用。`);
      } else {
        await enableSkill(skill.name);
        (window as any).__cf_toast?.success?.('已启用', `技能 ${skill.name} 现在可在 Chat 中使用。`);
      }
    } catch (e: any) {
      (window as any).__cf_toast?.error?.('操作失败', e?.message || '请稍后重试。');
    }
  };

  return (
    <div className="cf-card cf-col4">
      <div className="cf-row" style={{ alignItems: 'center', justifyContent: 'space-between' }}>
        <h3 style={{ margin: 0 }}>{skill.name}</h3>
        <span className={skill.installed ? 'cf-chip cf-chipRunning' : 'cf-chip cf-chipStopped'}>
          {skill.installed ? 'Installed' : 'Not Installed'}
        </span>
      </div>
      <div className="cf-sub">{skill.description}</div>
      <div className="cf-help">v{skill.version}</div>
      <div className="cf-divider" />
      <div className="cf-row" style={{ alignItems: 'center', justifyContent: 'space-between' }}>
        <div className="cf-row" style={{ alignItems: 'center', gap: 8 }}>
          <span className="cf-sub">启用</span>
          <button
            className={skill.enabled ? 'cf-btn cf-btnGold cf-btnSmall' : 'cf-btn cf-btnSmall'}
            onClick={() => void onToggle()}
            disabled={!skill.installed || isLoading}
            title={!skill.installed ? '未安装时不可启用' : ''}
          >
            {skill.enabled ? 'ON' : 'OFF'}
          </button>
        </div>
        <div className="cf-row">
          {skill.installed ? (
            <button className="cf-btn cf-btnSmall" onClick={() => void onUninstall()} disabled={isLoading}>
              卸载
            </button>
          ) : (
            <button className="cf-btn cf-btnPrimary cf-btnSmall" onClick={() => void onInstall()} disabled={isLoading}>
              安装
            </button>
          )}
          <button
            className="cf-btn cf-btnGhost cf-btnSmall"
            onClick={() => (window as any).__cf_toast?.success?.('详情（示例）', '真实产品中可跳转到技能详情页。')}
          >
            详情
          </button>
        </div>
      </div>
      {!skill.installed ? <div className="cf-help">未安装时“启用”不可用，并给出解释。</div> : null}
    </div>
  );
};

