import { FC } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

const SkillsHubPanel: FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  return (
    <div className="cf-hubPage">
      <div className="cf-hubPage__head">
        <div>
          <h2 className="cf-hubPage__title">{t('chat.workspaceHub.skillsTitle')}</h2>
          <button type="button" className="cf-btn cf-btnGhost cf-btnSmall" onClick={() => navigate('/skills')}>
            {t('chat.workspaceHub.skillsFullPage')}
          </button>
        </div>
      </div>
      <div className="cf-hubCard">
        <div className="cf-hubCard__body">{t('skills.hermesSub')}</div>
      </div>
    </div>
  );
};

export default SkillsHubPanel;
