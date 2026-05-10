import { FC, useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PlusOutlined, SaveOutlined, DeleteOutlined } from '@ant-design/icons';
import {
  defaultTodoTrigger,
  type TodoTriggerRecord,
  type TodoTriggerRepeat,
} from '../../shared/todo-triggers';
import { useTodoTriggerStore } from '../../store/modules/todoTriggerStore';
import './todoTriggersPanel.css';

type Props = { workspacePath: string | null };

function toLocalDatetimeValue(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalDatetimeValue(s: string): number {
  const t = new Date(s).getTime();
  return Number.isFinite(t) ? t : Date.now();
}

const TodoTriggersPanel: FC<Props> = ({ workspacePath }) => {
  const { t } = useTranslation();
  const storeTriggers = useTodoTriggerStore((s) => s.triggers);
  const setStoreTriggers = useTodoTriggerStore((s) => s.setTriggers);
  const load = useTodoTriggerStore((s) => s.load);

  const [triggers, setTriggers] = useState<TodoTriggerRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void load();
  }, [load, workspacePath]);

  useEffect(() => {
    setTriggers(storeTriggers);
    setSelectedId((prev) => {
      if (prev && storeTriggers.some((x) => x.id === prev)) return prev;
      const pend = storeTriggers.find((x) => x.status === 'pending');
      return pend?.id ?? storeTriggers[0]?.id ?? null;
    });
  }, [storeTriggers]);

  const pending = useMemo(
    () => triggers.filter((x) => x.status === 'pending').sort((a, b) => b.updatedAt - a.updatedAt),
    [triggers]
  );
  const done = useMemo(
    () => triggers.filter((x) => x.status === 'done').sort((a, b) => b.updatedAt - a.updatedAt),
    [triggers]
  );

  const selected = selectedId ? triggers.find((x) => x.id === selectedId) ?? null : null;
  const readOnly = selected?.status === 'done';

  const patchSelected = useCallback((patch: Partial<TodoTriggerRecord>) => {
    if (!selectedId) return;
    setTriggers((prev) =>
      prev.map((x) => (x.id === selectedId ? { ...x, ...patch, updatedAt: Date.now() } : x))
    );
  }, [selectedId]);

  const patchTrigger = useCallback((partial: Partial<TodoTriggerRecord['trigger']>) => {
    if (!selectedId) return;
    setTriggers((prev) =>
      prev.map((x) =>
        x.id === selectedId
          ? { ...x, trigger: { ...x.trigger, ...partial } as TodoTriggerRecord['trigger'], updatedAt: Date.now() }
          : x
      )
    );
  }, [selectedId]);

  const patchAction = useCallback((partial: Partial<TodoTriggerRecord['action']>) => {
    if (!selectedId) return;
    setTriggers((prev) =>
      prev.map((x) =>
        x.id === selectedId ? { ...x, action: { ...x.action, ...partial }, updatedAt: Date.now() } : x
      )
    );
  }, [selectedId]);

  const onSave = async () => {
    if (!workspacePath?.trim()) return;
    for (const tr of triggers) {
      if (tr.trigger.kind === 'schedule' && tr.trigger.repeat === 'interval') {
        const m = tr.trigger.intervalMinutes ?? 0;
        if (m < 1) {
          (window as unknown as { __cf_toast?: { error: (a: string) => void } }).__cf_toast?.error(
            t('todoTriggers.intervalInvalid')
          );
          return;
        }
      }
    }
    setSaving(true);
    try {
      const res = await window.electronAPI?.todoTriggersSaveAll?.(triggers);
      if (res && 'ok' in res && res.ok) {
        setStoreTriggers(triggers);
        (window as unknown as { __cf_toast?: { success: (a: string) => void } }).__cf_toast?.success(
          t('todoTriggers.saved')
        );
      } else {
        (window as unknown as { __cf_toast?: { error: (a: string) => void } }).__cf_toast?.error(
          t('todoTriggers.saveFailed')
        );
      }
    } finally {
      setSaving(false);
    }
  };

  const onAdd = () => {
    const n = defaultTodoTrigger({ title: t('todoTriggers.newTitle') });
    setTriggers((prev) => [n, ...prev]);
    setSelectedId(n.id);
  };

  const onDelete = () => {
    if (!selectedId) return;
    setTriggers((prev) => prev.filter((x) => x.id !== selectedId));
    setSelectedId(null);
  };

  if (!workspacePath?.trim()) {
    return <div className="cf-todoPanel__empty">{t('chat.rightTabs.noWorkspaceForTree')}</div>;
  }

  const nextFireStr =
    selected && selected.trigger.kind === 'schedule' && selected.trigger.nextFireAt != null
      ? toLocalDatetimeValue(selected.trigger.nextFireAt)
      : toLocalDatetimeValue(Date.now() + 60_000);

  return (
    <div className="cf-todoPanel">
      <div className="cf-todoPanel__toolbar">
        <button type="button" className="cf-btn cf-btnGhost cf-btnSmall" onClick={() => void onSave()} disabled={saving}>
          <SaveOutlined /> {t('common.save')}
        </button>
        <button type="button" className="cf-btn cf-btnGhost cf-btnSmall" onClick={onAdd} disabled={readOnly}>
          <PlusOutlined /> {t('todoTriggers.add')}
        </button>
        <button
          type="button"
          className="cf-btn cf-btnGhost cf-btnSmall"
          onClick={onDelete}
          disabled={!selected || readOnly}
        >
          <DeleteOutlined /> {t('common.delete')}
        </button>
      </div>
      <div className="cf-todoPanel__split">
        <div className="cf-todoPanel__listCol">
          <div className="cf-todoPanel__sectionTitle">{t('todoTriggers.sectionPending')}</div>
          <div className="cf-todoPanel__list" role="list">
            {pending.map((x) => (
              <button
                key={x.id}
                type="button"
                role="listitem"
                className={`cf-todoPanel__row${x.id === selectedId ? ' cf-todoPanel__row--active' : ''}${
                  !x.enabled ? ' cf-todoPanel__row--off' : ''
                }`}
                onClick={() => setSelectedId(x.id)}
              >
                <span className="cf-todoPanel__rowTitle">{x.title}</span>
              </button>
            ))}
          </div>
          <div className="cf-todoPanel__sectionTitle cf-todoPanel__sectionTitle--done">{t('todoTriggers.sectionDone')}</div>
          <div className="cf-todoPanel__list" role="list">
            {done.map((x) => (
              <button
                key={x.id}
                type="button"
                role="listitem"
                className={`cf-todoPanel__row cf-todoPanel__row--done${x.id === selectedId ? ' cf-todoPanel__row--active' : ''}`}
                onClick={() => setSelectedId(x.id)}
              >
                <span className="cf-todoPanel__rowTitle">{x.title}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="cf-todoPanel__gutter" aria-hidden />
        <div className={`cf-todoPanel__editor${readOnly ? ' cf-todoPanel__editor--readonly' : ''}`}>
          {!selected ? (
            <div className="cf-sub">{t('todoTriggers.selectHint')}</div>
          ) : (
            <>
              <label className="cf-todoPanel__field">
                <span>{t('todoTriggers.fieldTitle')}</span>
                <input
                  type="text"
                  value={selected.title}
                  disabled={readOnly}
                  onChange={(e) => patchSelected({ title: e.target.value })}
                />
              </label>
              <label className="cf-todoPanel__field cf-todoPanel__field--row">
                <input
                  type="checkbox"
                  checked={selected.enabled}
                  disabled={readOnly}
                  onChange={(e) => patchSelected({ enabled: e.target.checked })}
                />
                <span>{t('todoTriggers.fieldEnabled')}</span>
              </label>
              {selected.trigger.kind === 'schedule' ? (
                <>
                  <label className="cf-todoPanel__field">
                    <span>{t('todoTriggers.fieldRepeat')}</span>
                    <select
                      value={selected.trigger.repeat}
                      disabled={readOnly}
                      onChange={(e) => {
                        const repeat = e.target.value as TodoTriggerRepeat;
                        patchTrigger({
                          repeat,
                          intervalMinutes: repeat === 'interval' ? selected.trigger.intervalMinutes ?? 60 : undefined,
                        });
                      }}
                    >
                      <option value="once">{t('todoTriggers.repeatOnce')}</option>
                      <option value="interval">{t('todoTriggers.repeatInterval')}</option>
                    </select>
                  </label>
                  <label className="cf-todoPanel__field">
                    <span>{t('todoTriggers.fieldNextFire')}</span>
                    <input
                      type="datetime-local"
                      value={nextFireStr}
                      disabled={readOnly || selected.trigger.repeat === 'interval'}
                      onChange={(e) => patchTrigger({ nextFireAt: fromLocalDatetimeValue(e.target.value) })}
                  />
                  </label>
                  {selected.trigger.repeat === 'interval' ? (
                    <label className="cf-todoPanel__field">
                      <span>{t('todoTriggers.fieldIntervalMinutes')}</span>
                      <input
                        type="number"
                        min={1}
                        step={1}
                        value={selected.trigger.intervalMinutes ?? 60}
                        disabled={readOnly}
                        onChange={(e) =>
                          patchTrigger({ intervalMinutes: Math.max(1, Number(e.target.value) || 60) })
                        }
                      />
                    </label>
                  ) : null}
                </>
              ) : null}
              <label className="cf-todoPanel__field">
                <span>{t('todoTriggers.fieldPayload')}</span>
                <textarea
                  rows={5}
                  value={selected.action.text}
                  disabled={readOnly}
                  onChange={(e) => patchAction({ text: e.target.value })}
                />
              </label>
              <label className="cf-todoPanel__field cf-todoPanel__field--row">
                <input
                  type="checkbox"
                  checked={selected.action.submitToModel}
                  disabled={readOnly}
                  onChange={(e) => patchAction({ submitToModel: e.target.checked })}
                />
                <span>{t('todoTriggers.fieldSubmitToModel')}</span>
              </label>
              {selected.trigger.repeat === 'interval' ? (
                <label className="cf-todoPanel__field cf-todoPanel__field--row">
                  <input
                    type="checkbox"
                    checked={Boolean(selected.consumeOnFire)}
                    disabled={readOnly}
                    onChange={(e) => patchSelected({ consumeOnFire: e.target.checked })}
                  />
                  <span>{t('todoTriggers.fieldConsumeOnFire')}</span>
                </label>
              ) : null}
              {selected.lastFiredAt ? (
                <div className="cf-sub cf-todoPanel__meta">
                  {t('todoTriggers.lastFired', { time: new Date(selected.lastFiredAt).toLocaleString() })}
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default TodoTriggersPanel;
