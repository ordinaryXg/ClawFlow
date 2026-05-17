import { FC } from 'react';
import { useTranslation } from 'react-i18next';
import type { PendingSendDisplayItem } from '../../store/modules/chatStore';

type Props = {
  items: PendingSendDisplayItem[];
  onRemove: (id: string) => void;
};

const PendingSendQueue: FC<Props> = ({ items, onRemove }) => {
  const { t } = useTranslation();
  if (!items.length) return null;

  return (
    <div className="cf-pendingSendQueue" role="region" aria-label={t('chat.pendingSendTitle')}>
      <div className="cf-pendingSendQueue__head">{t('chat.pendingSendTitle')}</div>
      <ul className="cf-pendingSendQueue__list">
        {items.map((item, index) => (
          <li key={item.id} className="cf-pendingSendQueue__item">
            <span className="cf-pendingSendQueue__index">{index + 1}</span>
            <span className="cf-pendingSendQueue__text" title={item.content}>
              {item.content}
            </span>
            <button
              type="button"
              className="cf-btn cf-btnGhost cf-btnSmall cf-pendingSendQueue__remove"
              onClick={() => onRemove(item.id)}
              aria-label={t('chat.pendingSendRemove')}
            >
              ×
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default PendingSendQueue;
