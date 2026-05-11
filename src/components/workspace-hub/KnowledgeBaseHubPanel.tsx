import { FC } from 'react';
import { useTranslation } from 'react-i18next';
import './WorkspaceHubPanels.css';

const KnowledgeBaseHubPanel: FC = () => {
  const { t } = useTranslation();

  return (
    <div className="cf-hubPage">
      <div className="cf-hubPage__toolbar">
        <div className="cf-hubPage__titleRow">
          <h2 className="cf-hubPage__title">{t('chat.workspaceHub.kbTitle')}</h2>
        </div>
        <p className="cf-sub" style={{ margin: '8px 0 0', fontSize: 12 }}>
          {t('chat.workspaceHub.kbHint')}
        </p>
      </div>
      <div className="cf-hubPage__scroll">
        <div className="cf-hubCard">
          <div className="cf-hubCard__body">{t('chat.workspaceHub.kbPlaceholder')}</div>
        </div>
      </div>
    </div>
  );
};

export default KnowledgeBaseHubPanel;
