import type { FC } from 'react';
import { useTranslation } from 'react-i18next';

type Props = { activeWorkspacePath: string | null };

const DataSettingsSection: FC<Props> = ({ activeWorkspacePath }) => {
  const { t } = useTranslation();
  return (
      <div className="cf-card">
        <div className="cf-help" style={{ marginBottom: 8 }}>
          {t('settings.dataCurrentWorkspace')}：
          <span className="cf-settingsModels__mono" style={{ wordBreak: 'break-all', display: 'block', marginTop: 4 }}>
            {activeWorkspacePath || '—'}
          </span>
        </div>
        <div className="cf-help" style={{ marginBottom: 6 }}>
          {t('settings.dataWorkspaceBullet')}
        </div>
        <div className="cf-help">{t('settings.dataGlobalBullet')}</div>
      </div>
  );
};

export default DataSettingsSection;
