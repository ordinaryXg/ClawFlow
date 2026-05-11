import { FC, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useSubAgentStore } from '../../store/modules/subAgentStore';
import './WorkspaceHubPanels.css';

const SubAgentsHubPanel: FC = () => {
  const { t } = useTranslation();
  const slots = useSubAgentStore((s) => s.slots);

  const badges = useMemo(
    () =>
      ({
        running: 'cf-hubBadge--running',
        starting: 'cf-hubBadge--starting',
        stopped: 'cf-hubBadge--stopped',
        error: 'cf-hubBadge--error',
      }) as const,
    []
  );

  return (
    <div className="cf-hubPage">
      <div className="cf-hubPage__toolbar">
        <div className="cf-hubPage__titleRow">
          <h2 className="cf-hubPage__title">{t('chat.workspaceHub.subAgentsTitle')}</h2>
        </div>
        <p className="cf-sub" style={{ margin: '8px 0 0', fontSize: 12 }}>
          {t('chat.workspaceHub.subAgentsHint')}
        </p>
      </div>
      <div className="cf-hubPage__scroll">
        {slots.length === 0 ? (
          <div className="cf-hubCard">
            <div className="cf-hubCard__body">{t('chat.workspaceHub.subAgentsEmpty')}</div>
          </div>
        ) : (
          slots.map((a) => (
            <div key={a.id} className="cf-hubCard">
              <div className="cf-hubCard__head">
                <span className="cf-hubCard__name">{a.label || a.id}</span>
                <span className={`cf-hubBadge ${badges[a.status]}`}>{t(`chat.workspaceHub.subAgentStatus.${a.status}`)}</span>
              </div>
              <div className="cf-hubCard__body">{a.behavior || t('chat.workspaceHub.subAgentNoBehavior')}</div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default SubAgentsHubPanel;
