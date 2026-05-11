import { FC, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useSkillStore } from '../../store/modules/skillStore';
import Loading from '../common/Loading';
import './WorkspaceHubPanels.css';

const SkillsHubPanel: FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { skills, isLoading, error, fetchSkills, setError } = useSkillStore();

  useEffect(() => {
    void fetchSkills();
  }, [fetchSkills]);

  const installed = useMemo(
    () => skills.filter((s) => s.installed).sort((a, b) => a.name.localeCompare(b.name)),
    [skills]
  );

  return (
    <div className="cf-hubPage">
      <div className="cf-hubPage__toolbar">
        <div className="cf-hubPage__titleRow">
          <h2 className="cf-hubPage__title">{t('chat.workspaceHub.skillsTitle')}</h2>
          <button type="button" className="cf-btn cf-btnGhost cf-btnSmall" onClick={() => navigate('/skills')}>
            {t('chat.workspaceHub.skillsFullPage')}
          </button>
        </div>
        <p className="cf-sub" style={{ margin: '8px 0 0', fontSize: 12 }}>
          {t('chat.workspaceHub.skillsHint')}
        </p>
      </div>
      <div className="cf-hubPage__scroll">
        {isLoading ? (
          <Loading />
        ) : error ? (
          <div className="cf-hubCard">
            <div className="cf-hubCard__body">{error}</div>
            <button type="button" className="cf-btn cf-btnGhost cf-btnSmall" style={{ marginTop: 8 }} onClick={() => setError(null)}>
              {t('common.clear')}
            </button>
          </div>
        ) : installed.length === 0 ? (
          <div className="cf-hubCard">
            <div className="cf-hubCard__body">{t('chat.workspaceHub.skillsEmpty')}</div>
          </div>
        ) : (
          installed.map((sk) => (
            <div key={sk.name} className="cf-hubCard">
              <div className="cf-hubCard__head">
                <span className="cf-hubCard__name">{sk.name}</span>
                <span className={`cf-hubBadge ${sk.enabled ? 'cf-hubBadge--running' : 'cf-hubBadge--stopped'}`}>
                  {sk.enabled ? t('skills.enabledTitle') : t('skills.disabledTitle')}
                </span>
              </div>
              <div className="cf-hubCard__body">{sk.description}</div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default SkillsHubPanel;
