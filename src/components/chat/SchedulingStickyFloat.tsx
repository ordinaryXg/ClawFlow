import { FC, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useWorkspaceStore } from '../../store/modules/workspaceStore';
import { useScheduleTriggerStore } from '../../store/modules/scheduleTriggerStore';
import './schedulingStickyFloat.css';

/** 便签模式：对话区顶部半透明渐隐周期调度条 */
const SchedulingStickyFloat: FC = () => {
  const { t } = useTranslation();
  const activePath = useWorkspaceStore((s) => s.activePath);
  const triggers = useScheduleTriggerStore((s) => s.triggers);
  const load = useScheduleTriggerStore((s) => s.load);

  useEffect(() => {
    void load();
  }, [load, activePath]);

  const pending = triggers.filter((x) => x.status === 'pending' && x.enabled);

  if (pending.length === 0) return null;

  return (
    <div className="cf-schedulingFloat" aria-label={t('scheduling.stickyFloatAria')}>
      <div className="cf-schedulingFloat__inner">
        {pending.map((x) => (
          <span key={x.id} className="cf-schedulingFloat__chip" title={x.title}>
            {x.title}
          </span>
        ))}
      </div>
    </div>
  );
};

export default SchedulingStickyFloat;
