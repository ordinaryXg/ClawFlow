import { FC } from 'react';
import { useTranslation } from 'react-i18next';
import './styles.css';

/** OpenClaw 技能市场已移除；此处为 Hermes 式自主进化型 Skills 的占位页 */
const SkillsPage: FC = () => {
  const { t } = useTranslation();
  return (
    <div className="cf-skillsPage">
      <div className="cf-skillsPage__hero">
        <h2>{t('skills.hermesTitle')}</h2>
        <p className="cf-sub">{t('skills.hermesSub')}</p>
        <p className="cf-help">{t('skills.hermesHint')}</p>
      </div>
    </div>
  );
};

export default SkillsPage;
