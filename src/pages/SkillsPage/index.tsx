import { FC } from 'react';
import { useTranslation } from 'react-i18next';
import { useWorkspaceStore } from '../../store/modules/workspaceStore';
import HermesSkillsBrowser from '../../components/workspace-hub/HermesSkillsBrowser';
import './styles.css';

const SkillsPage: FC = () => {
  const { t } = useTranslation();
  const activePath = useWorkspaceStore((s) => s.activePath);

  return (
    <div className="cf-skillsPage">
      <div className="cf-skillsPage__intro">
        <h2>{t('skills.hermesTitle')}</h2>
        <p className="cf-sub">{t('skills.hermesSub')}</p>
      </div>
      <div className="cf-skillsPage__browser">
        <HermesSkillsBrowser workspacePath={activePath} layout="page" />
      </div>
    </div>
  );
};

export default SkillsPage;
