import { FC, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Skill, useSkillStore } from '../../store/modules/skillStore';
import './styles.css';

type FilterMode = 'all' | 'installed' | 'notInstalled';

const SkillsPage: FC = () => {
  const { t } = useTranslation();
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
        if (a.installed !== b.installed) return a.installed ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
  }, [skills, query, filter]);

  return (
    <div className="cf-skillsPage">
      <div className="cf-topbar">
        <div className="cf-pageTitle">
          <h2>{t('skills.title')}</h2>
          <p>{t('skills.subtitle')}</p>
        </div>
        <div className="cf-row">
          <button className="cf-btn cf-btnGhost" onClick={() => void fetchSkills()}>
            {isLoading ? t('skills.refreshing') : t('common.refresh')}
          </button>
        </div>
      </div>

      {error ? (
        <div className="cf-banner" style={{ borderColor: 'rgba(194,75,75,.45)', background: 'rgba(194,75,75,.10)' }}>
          <div>
            <b>{t('skills.loadFailed')}</b>
            <span>{error}</span>
          </div>
          <button className="cf-btn cf-btnGhost" onClick={() => setError(null)}>
            {t('common.clear')}
          </button>
        </div>
      ) : null}

      <div className="cf-card" style={{ marginTop: 12 }}>
        <div className="cf-row" style={{ alignItems: 'center', justifyContent: 'space-between' }}>
          <div className="cf-row" style={{ alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <input
              className="cf-input"
              style={{ width: 320 }}
              placeholder={t('skills.searchPlaceholder')}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <div className="cf-row">
              <button
                className={filter === 'all' ? 'cf-btn cf-btnGold cf-btnSmall' : 'cf-btn cf-btnSmall'}
                onClick={() => setFilter('all')}
              >
                {t('skills.filterAll')}
              </button>
              <button
                className={filter === 'installed' ? 'cf-btn cf-btnGold cf-btnSmall' : 'cf-btn cf-btnSmall'}
                onClick={() => setFilter('installed')}
              >
                {t('skills.filterInstalled')}
              </button>
              <button
                className={filter === 'notInstalled' ? 'cf-btn cf-btnGold cf-btnSmall' : 'cf-btn cf-btnSmall'}
                onClick={() => setFilter('notInstalled')}
              >
                {t('skills.filterNotInstalled')}
              </button>
            </div>
          </div>
          <span className="cf-sub">{t('skills.count', { count: filtered.length })}</span>
        </div>
      </div>

      <div style={{ height: 12 }} />

      {filtered.length === 0 ? (
        <div className="cf-card">
          <h3>{t('skills.emptyTitle')}</h3>
          <div className="cf-sub">{t('skills.emptySub')}</div>
          <div style={{ height: 12 }} />
          <button className="cf-btn cf-btnPrimary" onClick={() => setQuery('')}>
            {t('skills.clearSearch')}
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
  const { t } = useTranslation();
  const { installSkill, uninstallSkill, enableSkill, disableSkill, isLoading } = useSkillStore();

  const onInstall = async () => {
    try {
      await installSkill(skill.name);
      (window as any).__cf_toast?.success?.(t('skills.installOkTitle'), t('skills.installOkBody', { name: skill.name }));
    } catch (e: any) {
      (window as any).__cf_toast?.error?.(t('skills.installFailTitle'), e?.message || t('common.sampleOpFailBody'));
    }
  };

  const onUninstall = async () => {
    try {
      await uninstallSkill(skill.name);
      (window as any).__cf_toast?.success?.(t('skills.uninstallOkTitle'), t('skills.uninstallOkBody', { name: skill.name }));
    } catch (e: any) {
      (window as any).__cf_toast?.error?.(t('skills.uninstallFailTitle'), e?.message || t('common.sampleOpFailBody'));
    }
  };

  const onToggle = async () => {
    if (!skill.installed) return;
    try {
      if (skill.enabled) {
        await disableSkill(skill.name);
        (window as any).__cf_toast?.success?.(t('skills.disabledTitle'), t('skills.disabledBody', { name: skill.name }));
      } else {
        await enableSkill(skill.name);
        (window as any).__cf_toast?.success?.(t('skills.enabledTitle'), t('skills.enabledBody', { name: skill.name }));
      }
    } catch (e: any) {
      (window as any).__cf_toast?.error?.(t('skills.opFailTitle'), e?.message || t('common.sampleOpFailBody'));
    }
  };

  return (
    <div className="cf-card cf-col4">
      <div className="cf-row" style={{ alignItems: 'center', justifyContent: 'space-between' }}>
        <h3 style={{ margin: 0 }}>{skill.name}</h3>
        <span className={skill.installed ? 'cf-chip cf-chipRunning' : 'cf-chip cf-chipStopped'}>
          {skill.installed ? t('skills.installed') : t('skills.notInstalled')}
        </span>
      </div>
      <div className="cf-sub">{skill.description}</div>
      <div className="cf-help">v{skill.version}</div>
      <div className="cf-divider" />
      <div className="cf-row" style={{ alignItems: 'center', justifyContent: 'space-between' }}>
        <div className="cf-row" style={{ alignItems: 'center', gap: 8 }}>
          <span className="cf-sub">{t('skills.enable')}</span>
          <button
            className={skill.enabled ? 'cf-btn cf-btnGold cf-btnSmall' : 'cf-btn cf-btnSmall'}
            onClick={() => void onToggle()}
            disabled={!skill.installed || isLoading}
            title={!skill.installed ? t('skills.enableHint') : ''}
          >
            {skill.enabled ? t('common.on') : t('common.off')}
          </button>
        </div>
        <div className="cf-row">
          {skill.installed ? (
            <button className="cf-btn cf-btnSmall" onClick={() => void onUninstall()} disabled={isLoading}>
              {t('common.uninstall')}
            </button>
          ) : (
            <button className="cf-btn cf-btnPrimary cf-btnSmall" onClick={() => void onInstall()} disabled={isLoading}>
              {t('common.install')}
            </button>
          )}
          <button
            className="cf-btn cf-btnGhost cf-btnSmall"
            onClick={() =>
              (window as any).__cf_toast?.success?.(t('common.sampleTitle'), t('common.sampleDetailBody'))
            }
          >
            {t('common.details')}
          </button>
        </div>
      </div>
      {!skill.installed ? <div className="cf-help">{t('skills.enableHintNote')}</div> : null}
    </div>
  );
};
