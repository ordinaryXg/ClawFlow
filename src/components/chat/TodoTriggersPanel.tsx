import { FC, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
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

function validateTriggersForSave(list: TodoTriggerRecord[], tErr: (k: string) => string): string | null {
  for (const tr of list) {
    if (tr.trigger.kind === 'schedule' && tr.trigger.repeat === 'interval') {
      const m = tr.trigger.intervalMinutes ?? 0;
      if (m < 1) return tErr('todoTriggers.intervalInvalid');
    }
    if (tr.trigger.kind === 'schedule' && tr.trigger.repeat === 'cron') {
      const c = String(tr.trigger.cron ?? '').trim();
      if (!c) return tErr('todoTriggers.cronInvalid');
    }
  }
  return null;
}

const TodoTriggersPanel: FC<Props> = ({ workspacePath }) => {
  const { t } = useTranslation();
  const storeTriggers = useTodoTriggerStore((s) => s.triggers);
  const load = useTodoTriggerStore((s) => s.load);

  const [triggers, setTriggers] = useState<TodoTriggerRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creatingId, setCreatingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const creatingIdRef = useRef<string | null>(null);
  const persistTimerRef = useRef<number | null>(null);
  const triggersRef = useRef(triggers);
  triggersRef.current = triggers;
  const workspacePathRef = useRef(workspacePath);
  workspacePathRef.current = workspacePath;

  useEffect(() => {
    creatingIdRef.current = creatingId;
  }, [creatingId]);

  const prevWorkspacePathRef = useRef(workspacePath);
  /** 切换工作区时清空未保存草稿，避免把上一工作区的条目 merge 进来 */
  useEffect(() => {
    if (prevWorkspacePathRef.current === workspacePath) return;
    prevWorkspacePathRef.current = workspacePath;
    creatingIdRef.current = null;
    setCreatingId(null);
  }, [workspacePath]);

  useEffect(() => {
    void load();
  }, [load, workspacePath]);

  /** 远端列表刷新时不要覆盖内存里「尚未保存的新建」行及其编辑内容 */
  useEffect(() => {
    setTriggers((prev) => {
      const cid = creatingIdRef.current;
      const localDraft = cid ? prev.find((x) => x.id === cid) : undefined;
      const keepDraft = Boolean(cid && localDraft && !storeTriggers.some((x) => x.id === cid));
      if (keepDraft && localDraft) {
        return [localDraft, ...storeTriggers.filter((x) => x.id !== localDraft.id)];
      }
      return [...storeTriggers];
    });
    setSelectedId((prev) => {
      if (prev && storeTriggers.some((x) => x.id === prev)) return prev;
      const cid = creatingIdRef.current;
      if (prev && cid && prev === cid) return prev;
      const pend = storeTriggers.find((x) => x.status === 'pending');
      return pend?.id ?? storeTriggers[0]?.id ?? null;
    });
  }, [storeTriggers]);

  useEffect(() => {
    return () => {
      if (persistTimerRef.current != null) window.clearTimeout(persistTimerRef.current);
    };
  }, []);

  const sortedRows = useMemo(() => {
    const pending = triggers.filter((x) => x.status === 'pending').sort((a, b) => b.updatedAt - a.updatedAt);
    const done = triggers.filter((x) => x.status === 'done').sort((a, b) => b.updatedAt - a.updatedAt);
    return [...pending, ...done];
  }, [triggers]);

  const selected = selectedId ? triggers.find((x) => x.id === selectedId) ?? null : null;
  const readOnly = selected?.status === 'done';
  const isDraft = Boolean(creatingId && selectedId === creatingId);
  /** 旧版竞态可能未写入 lastFireSubmitToModel；归档后 action 仍保留触发时的勾选 */
  const showArchivedAiReceipt = Boolean(
    selected && (selected.lastFireSubmitToModel ?? selected.action.submitToModel)
  );

  const clearPersistTimer = () => {
    if (persistTimerRef.current != null) {
      window.clearTimeout(persistTimerRef.current);
      persistTimerRef.current = null;
    }
  };

  const persistTriggers = useCallback(
    async (next: TodoTriggerRecord[], opts?: { toastSuccess?: boolean }): Promise<boolean> => {
      if (!workspacePath?.trim()) return false;
      const errMsg = validateTriggersForSave(next, t);
      if (errMsg) {
        (window as unknown as { __cf_toast?: { error: (a: string) => void } }).__cf_toast?.error(errMsg);
        return false;
      }
      setSaving(true);
      try {
        const res = await window.electronAPI?.todoTriggersSaveAll?.(next);
        if (res && 'ok' in res && res.ok) {
          await load();
          if (opts?.toastSuccess) {
            (window as unknown as { __cf_toast?: { success: (a: string) => void } }).__cf_toast?.success(
              t('todoTriggers.saved')
            );
          }
          return true;
        }
        (window as unknown as { __cf_toast?: { error: (a: string) => void } }).__cf_toast?.error(
          t('todoTriggers.saveFailed')
        );
        return false;
      } finally {
        setSaving(false);
      }
    },
    [load, t, workspacePath]
  );

  const persistTriggersRef = useRef(persistTriggers);
  persistTriggersRef.current = persistTriggers;

  useEffect(() => {
    const flushPending = () => {
      if (persistTimerRef.current == null) return;
      if (!workspacePathRef.current?.trim()) return;
      window.clearTimeout(persistTimerRef.current);
      persistTimerRef.current = null;
      void persistTriggersRef.current(triggersRef.current);
    };
    const onVis = () => {
      if (document.visibilityState === 'hidden') flushPending();
    };
    window.addEventListener('pagehide', flushPending);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.removeEventListener('pagehide', flushPending);
      document.removeEventListener('visibilitychange', onVis);
      flushPending();
    };
  }, []);

  const scheduleDebouncedPersist = useCallback(
    (next: TodoTriggerRecord[]) => {
      if (creatingIdRef.current) return;
      clearPersistTimer();
      persistTimerRef.current = window.setTimeout(() => {
        persistTimerRef.current = null;
        void persistTriggers(next);
      }, 550);
    },
    [persistTriggers]
  );

  const patchSelected = useCallback(
    (patch: Partial<TodoTriggerRecord>) => {
      if (!selectedId) return;
      setTriggers((prev) => {
        const next = prev.map((x) => (x.id === selectedId ? { ...x, ...patch, updatedAt: Date.now() } : x));
        if (creatingIdRef.current !== selectedId) scheduleDebouncedPersist(next);
        return next;
      });
    },
    [selectedId, scheduleDebouncedPersist]
  );

  const patchTrigger = useCallback(
    (partial: Partial<TodoTriggerRecord['trigger']>) => {
      if (!selectedId) return;
      setTriggers((prev) => {
        const next = prev.map((x) =>
          x.id === selectedId
            ? { ...x, trigger: { ...x.trigger, ...partial } as TodoTriggerRecord['trigger'], updatedAt: Date.now() }
            : x
        );
        if (creatingIdRef.current !== selectedId) scheduleDebouncedPersist(next);
        return next;
      });
    },
    [selectedId, scheduleDebouncedPersist]
  );

  const patchAction = useCallback(
    (partial: Partial<TodoTriggerRecord['action']>) => {
      if (!selectedId) return;
      setTriggers((prev) => {
        const next = prev.map((x) =>
          x.id === selectedId ? { ...x, action: { ...x.action, ...partial }, updatedAt: Date.now() } : x
        );
        if (creatingIdRef.current !== selectedId) scheduleDebouncedPersist(next);
        return next;
      });
    },
    [selectedId, scheduleDebouncedPersist]
  );

  const onAdd = () => {
    if (creatingId) return;
    const n = defaultTodoTrigger({ title: t('todoTriggers.newTitle') });
    setTriggers((prev) => [n, ...prev]);
    setSelectedId(n.id);
    setCreatingId(n.id);
  };

  const onCancelDraft = () => {
    if (!creatingId) return;
    const id = creatingId;
    clearPersistTimer();
    const next = triggers.filter((x) => x.id !== id);
    setTriggers(next);
    setCreatingId(null);
    setSelectedId((sid) => {
      if (sid !== id) return sid;
      const pend = next.find((x) => x.status === 'pending');
      return pend?.id ?? next[0]?.id ?? null;
    });
  };

  const onSaveDraft = async () => {
    if (!creatingId || selectedId !== creatingId) return;
    clearPersistTimer();
    const ok = await persistTriggers(triggers, { toastSuccess: true });
    if (ok) setCreatingId(null);
  };

  const deleteTriggerById = async (id: string) => {
    if (!window.confirm(t('todoTriggers.confirmDeleteIrreversible'))) return;
    clearPersistTimer();
    const next = triggers.filter((x) => x.id !== id);
    setTriggers(next);
    if (creatingId === id) setCreatingId(null);
    setSelectedId((sid) => {
      if (sid !== id) return sid;
      const pend = next.find((x) => x.status === 'pending');
      return pend?.id ?? next[0]?.id ?? null;
    });
    await persistTriggers(next);
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
        <button type="button" className="cf-btn cf-btnGhost cf-btnSmall" onClick={onAdd} disabled={creatingId != null}>
          <PlusOutlined /> {t('todoTriggers.add')}
        </button>
      </div>
      <div className="cf-todoPanel__split">
        <div className="cf-todoPanel__listCol">
          <div className="cf-todoPanel__list cf-todoPanel__list--unified" role="list">
            {sortedRows.length === 0 ? (
              <div className="cf-todoPanel__listEmpty cf-sub">{t('todoTriggers.listEmpty')}</div>
            ) : (
              sortedRows.map((x) => {
                const running = x.status === 'pending';
                return (
                  <div
                    key={x.id}
                    className={`cf-todoPanel__row${x.id === selectedId ? ' cf-todoPanel__row--active' : ''}${
                      !x.enabled && running ? ' cf-todoPanel__row--off' : ''
                    }`}
                    role="listitem"
                  >
                    <button
                      type="button"
                      className="cf-todoPanel__rowSelect"
                      onClick={() => setSelectedId(x.id)}
                    >
                      <span className="cf-todoPanel__rowTitleLine">
                        <span className="cf-todoPanel__rowTitle">{x.title}</span>
                        <span className="cf-todoPanel__rowStatus">
                          <span
                            className={
                              running ? 'cf-todoPanel__statusDot cf-todoPanel__statusDot--running' : 'cf-todoPanel__statusDot cf-todoPanel__statusDot--archived'
                            }
                            aria-hidden
                          />
                          <span className="cf-todoPanel__statusLabel">
                            {running ? t('todoTriggers.statusRunning') : t('todoTriggers.statusArchived')}
                          </span>
                        </span>
                      </span>
                    </button>
                    <button
                      type="button"
                      className="cf-todoPanel__rowDel"
                      aria-label={t('todoTriggers.deleteRowAria')}
                      title={t('common.delete')}
                      onClick={(e) => {
                        e.stopPropagation();
                        void deleteTriggerById(x.id);
                      }}
                    >
                      <DeleteOutlined />
                    </button>
                  </div>
                );
              })
            )}
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
                          cron: repeat === 'cron' ? String((selected.trigger as any).cron ?? '').trim() || '0 9 * * *' : undefined,
                          cronTz: repeat === 'cron' ? String((selected.trigger as any).cronTz ?? '').trim() || undefined : undefined,
                        });
                      }}
                    >
                      <option value="once">{t('todoTriggers.repeatOnce')}</option>
                      <option value="interval">{t('todoTriggers.repeatInterval')}</option>
                      <option value="cron">{t('todoTriggers.repeatCron')}</option>
                    </select>
                  </label>
                  <label className="cf-todoPanel__field">
                    <span>{t('todoTriggers.fieldNextFire')}</span>
                    <input
                      type="datetime-local"
                      value={nextFireStr}
                      disabled={readOnly || selected.trigger.repeat === 'interval' || selected.trigger.repeat === 'cron'}
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
                  {selected.trigger.repeat === 'cron' ? (
                    <>
                      <label className="cf-todoPanel__field">
                        <span>{t('todoTriggers.fieldCron')}</span>
                        <input
                          type="text"
                          value={String((selected.trigger as any).cron ?? '')}
                          disabled={readOnly}
                          placeholder={t('todoTriggers.cronPh')}
                          onChange={(e) => patchTrigger({ cron: e.target.value } as any)}
                        />
                        <div className="cf-sub" style={{ marginTop: 6 }}>
                          {t('todoTriggers.cronHint')}
                        </div>
                      </label>
                      <label className="cf-todoPanel__field">
                        <span>{t('todoTriggers.fieldCronTz')}</span>
                        <input
                          type="text"
                          value={String((selected.trigger as any).cronTz ?? '')}
                          disabled={readOnly}
                          placeholder={t('todoTriggers.cronTzPh')}
                          onChange={(e) => patchTrigger({ cronTz: e.target.value || undefined } as any)}
                        />
                      </label>
                    </>
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
              {!readOnly && selected.lastFiredAt ? (
                <div className="cf-sub cf-todoPanel__meta">
                  {t('todoTriggers.lastFired', { time: new Date(selected.lastFiredAt).toLocaleString() })}
                </div>
              ) : null}
              {readOnly ? (
                <div className="cf-todoPanel__receipt">
                  <div className="cf-todoPanel__receiptHead">{t('todoTriggers.fireReceiptTitle')}</div>
                  {selected.lastFiredAt != null ? (
                    <div className="cf-todoPanel__receiptTime cf-sub">
                      {t('todoTriggers.fireReceiptTime', {
                        time: new Date(selected.lastFiredAt).toLocaleString(),
                      })}
                    </div>
                  ) : null}
                  {showArchivedAiReceipt ? (
                    <>
                      <div className="cf-todoPanel__receiptLabel cf-sub">
                        {t('todoTriggers.fireReceiptAiReply')}
                      </div>
                      <pre className="cf-todoPanel__receiptBody">
                        {String(selected.lastFireAiReceipt ?? '').trim() || t('todoTriggers.fireReceiptAiEmpty')}
                      </pre>
                    </>
                  ) : (
                    <div className="cf-todoPanel__receiptNoAi cf-sub">{t('todoTriggers.fireReceiptNoModel')}</div>
                  )}
                </div>
              ) : null}
              {isDraft ? (
                <div className="cf-todoPanel__draftBar">
                  <button
                    type="button"
                    className="cf-btn cf-btnPrimary cf-btnSmall"
                    disabled={saving}
                    onClick={() => void onSaveDraft()}
                  >
                    {t('common.save')}
                  </button>
                  <button
                    type="button"
                    className="cf-btn cf-btnGhost cf-btnSmall"
                    disabled={saving}
                    onClick={onCancelDraft}
                  >
                    {t('common.cancel')}
                  </button>
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
