import { FC, ReactNode } from 'react';

type Props = {
  title: string;
  description?: string;
  icon?: ReactNode;
  actionLabel?: string;
  onAction?: () => void;
};

const EmptyState: FC<Props> = ({ title, description, icon, actionLabel, onAction }) => {
  return (
    <div className="cf-empty">
      <div className="cf-empty__card cf-card">
        {icon ? <div className="cf-empty__icon">{icon}</div> : null}
        <h3 className="cf-empty__title">{title}</h3>
        {description ? <div className="cf-sub">{description}</div> : null}
        {actionLabel && onAction ? <div style={{ height: 12 }} /> : null}
        {actionLabel && onAction ? (
          <button className="cf-btn cf-btnPrimary" onClick={onAction}>
            {actionLabel}
          </button>
        ) : null}
      </div>
    </div>
  );
};

export default EmptyState;

