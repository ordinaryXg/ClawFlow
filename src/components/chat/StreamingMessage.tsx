import { FC } from 'react';
import { useTranslation } from 'react-i18next';
import './chat.css';

interface Props {
  content: string | null;
}

const StreamingMessage: FC<Props> = ({ content }) => {
  const { t } = useTranslation();
  if (!content) return null;

  return (
    <div className="cf-stream">
      <div className="cf-stream__bubble">
        <div className="cf-stream__meta">
          <span className="cf-sub">{t('chat.streamLabel')}</span>
        </div>
        <div className="cf-stream__content">{content}</div>
      </div>
    </div>
  );
};

export default StreamingMessage;

