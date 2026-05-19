import { FC, ReactNode, useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

export type ChangeLogKind =
  | 'conversation_round'
  | 'file_change'
  | 'evolution'
  | 'todo_added'
  | 'todo_triggered'
  | 'agent_dispatch'
  | 'skill_enabled'
  | 'skill_disabled'
  | 'skill_deleted';

const KINDS = new Set<string>([
  'conversation_round',
  'file_change',
  'evolution',
  'todo_added',
  'todo_triggered',
  'agent_dispatch',
  'skill_enabled',
  'skill_disabled',
  'skill_deleted',
]);

type Entry = {
  id: string;
  at: number;
  kind?: string;
  conversationId: string;
  title: string;
  userPreview: string;
  assistantExcerpt: string;
  meta?: Record<string, unknown>;
};

function coerceKind(raw: string | undefined): ChangeLogKind {
  const s = String(raw ?? '').trim();
  if (s && KINDS.has(s)) return s as ChangeLogKind;
  return 'conversation_round';
}

const ChangeHistoryPanel: FC<{ workspacePath: string | null }> = ({ workspacePath }) => {
  const { t, i18n } = useTranslation();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [revertingRunId, setRevertingRunId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!workspacePath) {
      setEntries([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await window.electronAPI?.workspaceGetChangeLog?.(120);
      setEntries(Array.isArray(res?.entries) ? res.entries : []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [workspacePath]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const onUpd = () => void load();
    window.addEventListener('cf-workspace-changelog-updated', onUpd);
    const offIpc = window.electronAPI?.onWorkspaceChangelogUpdated?.(() => void load());
    const offEvo = window.electronAPI?.onEvolutionRunsUpdated?.(() => void load());
    return () => {
      window.removeEventListener('cf-workspace-changelog-updated', onUpd);
      offIpc?.();
      offEvo?.();
    };
  }, [load]);

  const revertEvolution = async (runId: string) => {
    if (revertingRunId) return;
    setRevertingRunId(runId);
    try {
      const res = await window.electronAPI?.evolutionRevertRun?.(runId);
      if (!res?.ok) {
        setError(String(res?.error ?? t('chat.rightTabs.evolutionRevertFailed')));
        return;
      }
      window.dispatchEvent(new CustomEvent('cf-workspace-changelog-updated'));
      await load();
    } finally {
      setRevertingRunId(null);
    }
  };

  const locale = i18n.language?.startsWith('zh') ? 'zh-CN' : 'en-US';

  let body: ReactNode;
  if (!workspacePath) {
    body = <div className="cf-sub">{t('chat.rightTabs.changeLogNoWs')}</div>;
  } else if (loading && entries.length === 0) {
    body = <div className="cf-sub">{t('chat.rightTabs.changeLogLoading')}</div>;
  } else if (error) {
    body = <div className="cf-errorText">{error}</div>;
  } else if (entries.length === 0) {
    body = <div className="cf-sub">{t('chat.rightTabs.changeLogEmpty')}</div>;
  } else {
    body = (
      <ul className="cf-changeLog__list">
        {entries.map((e) => {
          const open = openId === e.id;
          const kind = coerceKind(e.kind);
          const kindKey = `chat.rightTabs.changeLogKind.${kind}`;
          const kindLabel = i18n.exists(kindKey) ? t(kindKey) : kind;
          const isChat = kind === 'conversation_round';
          const primaryLabel = isChat ? t('chat.rightTabs.changeUser') : t('chat.rightTabs.changeDetailPrimary');
          const secondaryLabel = isChat ? t('chat.rightTabs.changeAssistant') : t('chat.rightTabs.changeDetailSecondary');
          return (
            <li key={e.id} className="cf-changeLog__item">
              <button
                type="button"
                className="cf-changeLog__head"
                onClick={() => setOpenId(open ? null : e.id)}
                aria-expanded={open}
              >
                <span className="cf-changeLog__chev">{open ? '▾' : '▸'}</span>
                <time className="cf-changeLog__time" dateTime={new Date(e.at).toISOString()}>
                  {new Date(e.at).toLocaleString(locale)}
                </time>
                <span className={`cf-changeLog__kind cf-changeLog__kind--${kind}`} title={kindLabel}>
                  {kindLabel}
                </span>
                <span className="cf-changeLog__title">{e.title}</span>
              </button>
              {open ? (
                <div className="cf-changeLog__body">
                  <div className="cf-changeLog__label">{primaryLabel}</div>
                  <pre className="cf-changeLog__pre">{e.userPreview || '—'}</pre>
                  <div className="cf-changeLog__label">{secondaryLabel}</div>
                  <pre className="cf-changeLog__pre">{e.assistantExcerpt || '—'}</pre>
                  <div className="cf-changeLog__meta cf-sub">
                    {t('chat.rightTabs.changeConvId')}: {e.conversationId || '—'}
                  </div>
                  {kind === 'evolution' &&
                  typeof e.meta?.evolutionRunId === 'string' &&
                  e.meta?.evolutionOk === true &&
                  e.meta?.revertible === true &&
                  !e.meta?.evolutionReverted ? (
                    <button
                      type="button"
                      className="cf-btn cf-btnGhost cf-btnSmall"
                      style={{ marginTop: 8 }}
                      disabled={revertingRunId === e.meta.evolutionRunId}
                      onClick={() => void revertEvolution(String(e.meta?.evolutionRunId))}
                    >
                      {revertingRunId === e.meta.evolutionRunId
                        ? t('chat.rightTabs.evolutionReverting')
                        : t('chat.rightTabs.evolutionRevert')}
                    </button>
                  ) : null}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <div className="cf-changeLog">
      <div className="cf-changeLog__toolbar">
        <button
          type="button"
          className="cf-btn cf-btnGhost cf-btnSmall"
          onClick={() => void load()}
          disabled={!workspacePath}
        >
          {t('common.refresh')}
        </button>
      </div>
      <div className="cf-changeLog__scroll">{body}</div>
    </div>
  );
};

export default ChangeHistoryPanel;
