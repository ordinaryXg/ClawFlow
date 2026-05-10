import { FC } from 'react';
import { useTranslation } from 'react-i18next';
import type { ToolApprovalPendingState } from '../../store/modules/chatStore';

type Props = {
  pending: ToolApprovalPendingState;
  onRespond: (approved: boolean) => void;
};

const ToolApprovalBar: FC<Props> = ({ pending, onRespond }) => {
  const { t } = useTranslation();

  return (
    <div className="cf-toolApproval" role="region" aria-label={t('chat.toolApproval.aria')}>
      <div className="cf-toolApproval__title">{t('chat.toolApproval.title')}</div>
      <p className="cf-toolApproval__hint">{t('chat.toolApproval.hint')}</p>
      <ul className="cf-toolApproval__list">
        {pending.tools.map((tool, i) => (
          <li key={`${pending.approvalId}-${i}`} className="cf-toolApproval__item">
            <code className="cf-toolApproval__name">{tool.name}</code>
            {tool.argumentsPreview ? (
              <span className="cf-toolApproval__args" title={tool.argumentsPreview}>
                {tool.argumentsPreview}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
      <div className="cf-toolApproval__actions">
        <button type="button" className="cf-btn cf-btnGhost cf-btnSmall" onClick={() => onRespond(false)}>
          {t('chat.toolApproval.cancel')}
        </button>
        <button type="button" className="cf-btn cf-btnPrimary cf-btnSmall" onClick={() => onRespond(true)}>
          {t('chat.toolApproval.continue')}
        </button>
      </div>
    </div>
  );
};

export default ToolApprovalBar;
