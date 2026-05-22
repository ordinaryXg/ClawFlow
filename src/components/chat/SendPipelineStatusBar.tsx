import { FC, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

export type SendPipelineStreamPhase = 'idle' | 'waiting' | 'typing';

type Props = {
  isClassifyingMode: boolean;
  isExpectationPlanning: boolean;
  pendingQueueCount: number;
  streamPhase: SendPipelineStreamPhase;
  toolApprovalActive: boolean;
};

const SendPipelineStatusBar: FC<Props> = ({
  isClassifyingMode,
  isExpectationPlanning,
  pendingQueueCount,
  streamPhase,
  toolApprovalActive,
}) => {
  const { t } = useTranslation();

  const phase = useMemo(() => {
    if (toolApprovalActive) return 'toolApproval' as const;
    if (isClassifyingMode) return 'classifying' as const;
    if (isExpectationPlanning) return 'planning' as const;
    if (streamPhase === 'waiting') return 'waiting' as const;
    if (streamPhase === 'typing') return 'typing' as const;
    if (pendingQueueCount > 0) return 'queued' as const;
    return null;
  }, [
    toolApprovalActive,
    isClassifyingMode,
    isExpectationPlanning,
    streamPhase,
    pendingQueueCount,
  ]);

  if (!phase && pendingQueueCount <= 0) return null;

  const label =
    phase != null
      ? t(`chat.sendPipeline.${phase}`, { count: pendingQueueCount })
      : t('chat.sendPipeline.queuedOnly', { count: pendingQueueCount });

  const tone =
    phase === 'toolApproval'
      ? 'cf-sendPipeline--approval'
      : phase === 'waiting' || phase === 'typing'
        ? 'cf-sendPipeline--stream'
        : phase === 'queued' || (!phase && pendingQueueCount > 0)
          ? 'cf-sendPipeline--queue'
          : 'cf-sendPipeline--prep';

  return (
    <div className={['cf-sendPipeline', tone].filter(Boolean).join(' ')} role="status" aria-live="polite">
      <span className="cf-sendPipeline__dot" aria-hidden />
      <span className="cf-sendPipeline__label">{label}</span>
      {pendingQueueCount > 0 && phase && phase !== 'queued' ? (
        <span className="cf-sendPipeline__queueBadge">
          {t('chat.sendPipeline.queueBadge', { count: pendingQueueCount })}
        </span>
      ) : null}
    </div>
  );
};

export default SendPipelineStatusBar;
