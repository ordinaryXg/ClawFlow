import { FC, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { SkillMarketEntry } from '../../skill-market-shared';
import { Skill, useSkillStore } from '../../store/modules/skillStore';
import EmptyState from '../../components/common/EmptyState';
import Loading from '../../components/common/Loading';
import './styles.css';

type FilterMode = 'all' | 'installed' | 'notInstalled';

function marketSourceLabel(
  t: (k: string) => string,
  source: 'remote' | 'bundled' | 'remote+cached' | null
): string {
  if (!source) return '';
  if (source === 'remote') return t('skills.marketSourceRemote');
  if (source === 'bundled') return t('skills.marketSourceBundled');
  return t('skills.marketSourceCached');
}

const SkillsPage: FC = () => {
  const { t } = useTranslation();
  const {
    skills,
    isLoading,
    error,
    fetchSkills,
    setError,
    marketEntries,
    marketSource,
    marketWarning,
    marketLoading,
    marketError,
    fetchSkillMarket,
  } = useSkillStore();
  const [query, setQuery] = useState('');
  const [marketQuery, setMarketQuery] = useState('');
  const [filter, setFilter] = useState<FilterMode>('all');

  useEffect(() => {
    void fetchSkills();
    void fetchSkillMarket({ forceRefresh: false });
  }, [fetchSkills, fetchSkillMarket]);

  // OpenClaw CLI dependency removed; skills are managed via built-in engine.

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

  const installedNames = useMemo(() => new Set(skills.map((s) => s.name)), [skills]);

  const filteredMarket = useMemo(() => {
    const q = marketQuery.trim().toLowerCase();
    return marketEntries.filter((e) => {
      if (!q) return true;
      const blob = [e.name, e.id, e.package, e.description, e.title ?? '', e.version].join(' ').toLowerCase();
      return blob.includes(q);
    });
  }, [marketEntries, marketQuery]);

  return (
    <div className="cf-skillsPage">
      <div className="cf-topbar">
        <div className="cf-pageTitle">
          <h2>{t('skills.title')}</h2>
          <p>{t('skills.subtitle')}</p>
        </div>
        <div className="cf-row">
          <button
            className="cf-btn cf-btnGhost"
            onClick={() => {
              void fetchSkills();
              void fetchSkillMarket({ forceRefresh: false });
            }}
          >
            {isLoading || marketLoading ? t('skills.refreshing') : t('common.refresh')}
          </button>
        </div>
      </div>

      {null}

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

      <div className="cf-card" style={{ marginBottom: 16 }}>
        <h3 style={{ margin: '0 0 4px' }}>{t('skills.openclawSectionTitle')}</h3>
        <p className="cf-sub" style={{ margin: '0 0 14px' }}>
          {t('skills.openclawSectionSub')}
        </p>
        <div className="cf-row" style={{ alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
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
        <div style={{ marginTop: 16 }}>
          {isLoading && skills.length === 0 ? (
            <Loading label={t('skills.refreshing')} />
          ) : skills.length === 0 ? (
            <EmptyState title={t('skills.emptyLocalTitle')} description={t('skills.emptyLocalSub')} />
          ) : filtered.length === 0 ? (
            <EmptyState
              title={t('skills.emptyTitle')}
              description={t('skills.emptySub')}
              actionLabel={t('skills.clearSearch')}
              onAction={() => {
                setQuery('');
                setFilter('all');
              }}
            />
          ) : (
            <div className="cf-grid">
              {(filtered as Skill[]).map((s) => (
                <SkillCard key={s.name} skill={s} />
              ))}
            </div>
          )}
        </div>
      </div>

      {marketWarning ? (
        <div
          className="cf-banner"
          style={{ borderColor: 'rgba(210,153,34,.45)', background: 'rgba(210,153,34,.12)', marginBottom: 12 }}
        >
          <span>{t('skills.marketWarningBanner', { msg: marketWarning })}</span>
        </div>
      ) : null}

      {marketError ? (
        <div className="cf-banner" style={{ borderColor: 'rgba(194,75,75,.45)', background: 'rgba(194,75,75,.10)', marginBottom: 12 }}>
          <div>
            <b>{t('skills.loadFailed')}</b>
            <span>{marketError}</span>
          </div>
          <button className="cf-btn cf-btnGhost" onClick={() => void fetchSkillMarket({ forceRefresh: true })}>
            {t('skills.marketForceRefresh')}
          </button>
        </div>
      ) : null}

      <div className="cf-card">
        <div className="cf-row" style={{ alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 280px', minWidth: 0 }}>
            <h3 style={{ margin: '0 0 4px' }}>{t('skills.marketSectionTitle')}</h3>
            <p className="cf-sub" style={{ margin: '0 0 6px' }}>{t('skills.marketSectionSub')}</p>
            <p className="cf-sub" style={{ margin: '0 0 8px', lineHeight: 1.45 }}>{t('skills.marketSourceHint')}</p>
            {marketSource ? (
              <span className="cf-chip cf-chipStopped" title={marketSource}>
                {marketSourceLabel(t, marketSource)}
              </span>
            ) : null}
          </div>
          <div className="cf-row" style={{ flexShrink: 0 }}>
            <button className="cf-btn cf-btnGhost cf-btnSmall" onClick={() => void fetchSkillMarket({ forceRefresh: false })} disabled={marketLoading}>
              {t('skills.marketRefresh')}
            </button>
            <button className="cf-btn cf-btnSmall" onClick={() => void fetchSkillMarket({ forceRefresh: true })} disabled={marketLoading}>
              {t('skills.marketForceRefresh')}
            </button>
          </div>
        </div>

        <div className="cf-row" style={{ marginTop: 14, alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <input
            className="cf-input"
            style={{ width: 320, maxWidth: '100%' }}
            placeholder={t('skills.marketSearchPlaceholder')}
            value={marketQuery}
            onChange={(e) => setMarketQuery(e.target.value)}
          />
          <span className="cf-sub">{t('skills.count', { count: filteredMarket.length })}</span>
        </div>

        <div style={{ marginTop: 16 }}>
          {marketLoading && marketEntries.length === 0 ? (
            <Loading label={t('skills.refreshing')} />
          ) : filteredMarket.length === 0 ? (
            <EmptyState
              title={t('skills.marketEmpty')}
              description={t('skills.emptySub')}
              actionLabel={t('skills.clearSearch')}
              onAction={() => setMarketQuery('')}
            />
          ) : (
            <div className="cf-grid">
              {filteredMarket.map((e) => (
                <MarketSkillCard key={e.id} entry={e} installedNames={installedNames} />
              ))}
            </div>
          )}
        </div>
      </div>
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

const MarketSkillCard: FC<{ entry: SkillMarketEntry; installedNames: Set<string> }> = ({ entry, installedNames }) => {
  const { t } = useTranslation();
  const { installSkill, fetchSkills, isLoading } = useSkillStore();
  const inOpenClaw = installedNames.has(entry.package) || installedNames.has(entry.name);

  const onInstall = async () => {
    try {
      await installSkill(entry.package);
      await fetchSkills();
      (window as any).__cf_toast?.success?.(t('skills.installOkTitle'), t('skills.installOkBody', { name: entry.package }));
    } catch (e: any) {
      (window as any).__cf_toast?.error?.(t('skills.installFailTitle'), e?.message || t('common.sampleOpFailBody'));
    }
  };

  const displayTitle = entry.title?.trim() || entry.name;

  return (
    <div className="cf-card cf-col4">
      <div className="cf-row" style={{ alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <h3 style={{ margin: 0 }}>{displayTitle}</h3>
        {inOpenClaw ? (
          <span className="cf-chip cf-chipRunning">{t('skills.marketInstalledInOpenclaw')}</span>
        ) : (
          <span className="cf-chip cf-chipStopped">{t('skills.notInstalled')}</span>
        )}
      </div>
      <div className="cf-sub">{entry.description}</div>
      <div className="cf-help">
        {t('skills.marketPackage')}: <code style={{ fontSize: 11 }}>{entry.package}</code> · v{entry.version}
      </div>
      <div className="cf-divider" />
      <div className="cf-row" style={{ justifyContent: 'flex-end' }}>
        <button
          className="cf-btn cf-btnPrimary cf-btnSmall"
          onClick={() => void onInstall()}
          disabled={isLoading || inOpenClaw}
          title={inOpenClaw ? t('skills.marketInstalledInOpenclaw') : entry.package}
        >
          {t('common.install')}
        </button>
      </div>
    </div>
  );
};
