import { FC } from 'react';
import { useTranslation } from 'react-i18next';
import type { ConversationModeClassification } from '../../store/modules/chatStore';

type Props = {
  classifying: boolean;
  classification: ConversationModeClassification | null;
};

const ModeClassificationDebug: FC<Props> = ({ classifying, classification }) => {
  const { t } = useTranslation();

  if (classifying) {
    return (
      <div className="cf-chatModeDebug" role="status" aria-live="polite">
        {t('chat.modeClassifying')}
      </div>
    );
  }

  if (!classification) return null;

  const modeLabel =
    classification.mode === 'ask'
      ? t('chat.modeAsk')
      : classification.mode === 'plan'
        ? t('chat.modePlan')
        : t('chat.modeMultitask');

  return (
    <div className="cf-chatModeDebug" role="status" aria-live="polite">
      {t('chat.modeDebugLine', {
        mode: modeLabel,
        category: classification.category,
        label: classification.categoryLabel,
      })}
      {classification.fallback ? ` · ${t('chat.modeDebugFallback')}` : ''}
    </div>
  );
};

export default ModeClassificationDebug;
