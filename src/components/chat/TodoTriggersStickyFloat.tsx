import { FC, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useWorkspaceStore } from '../../store/modules/workspaceStore';
import { useTodoTriggerStore } from '../../store/modules/todoTriggerStore';
import './todoTriggersStickyFloat.css';

/** 便签模式：对话区顶部半透明渐隐待办条 */
const TodoTriggersStickyFloat: FC = () => {
  const { t } = useTranslation();
  const activePath = useWorkspaceStore((s) => s.activePath);
  const triggers = useTodoTriggerStore((s) => s.triggers);
  const load = useTodoTriggerStore((s) => s.load);

  useEffect(() => {
    void load();
  }, [load, activePath]);

  const pending = triggers.filter((x) => x.status === 'pending' && x.enabled);

  if (pending.length === 0) return null;

  return (
    <div className="cf-todoFloat" aria-label={t('todoTriggers.stickyFloatAria')}>
      <div className="cf-todoFloat__inner">
        {pending.map((x) => (
          <span key={x.id} className="cf-todoFloat__chip" title={x.title}>
            {x.title}
          </span>
        ))}
      </div>
    </div>
  );
};

export default TodoTriggersStickyFloat;
