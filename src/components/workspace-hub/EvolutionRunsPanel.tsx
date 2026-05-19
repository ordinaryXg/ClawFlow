import { FC, useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import './evolution-runs-panel.css';

type DiffEntry = { relPath: string; kind: string };
type Phase = { aspect: string; agentOk: boolean; diff: DiffEntry[] };
type Run = {
  runId: string;
  at: number;
  ok: boolean;
  manual?: boolean;
  failureReason?: string;
  phases: Phase[];
  aggregateDiff: DiffEntry[];
  reverted?: boolean;
};

type Props = {
  workspacePath: string | null;
};

const EvolutionRunsPanel: FC<Props> = ({ workspacePath }) => {
  const { t, i18n } = useTranslation();
  const [runs, setRuns] = useState<Run[]>([]);
  const [loading, setLoading] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [reverting, setReverting] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!workspacePath?.trim()) {
      setRuns([]);
      return;
    }
    setLoading(true);
    try {
      const res = await window.electronAPI?.evolutionListRuns?.(20);
      setRuns(Array.isArray(res?.runs) ? (res.runs as Run[]) : []);
    } catch {
      setRuns([]);
    } finally {
      setLoading(false);
    }
  }, [workspacePath]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const off = window.electronAPI?.onEvolutionRunsUpdated?.(() => void load());
    return () => off?.();
  }, [load]);

  const revert = async (runId: string) => {
    if (reverting) return;
    setReverting(runId);
    try {
      const res = await window.electronAPI?.evolutionRevertRun?.(runId);
      if (!res?.ok) {
        window.alert(String(res?.error ?? t('skills.evolutionRuns.revertFailed')));
        return;
      }
      window.dispatchEvent(new CustomEvent('cf-workspace-changelog-updated'));
      window.dispatchEvent(new CustomEvent('cf-intelligence-profile-reload'));
      await load();
    } finally {
      setReverting(null);
    }
  };

  const locale = i18n.language?.startsWith('zh') ? 'zh-CN' : 'en-US';

  if (!workspacePath?.trim()) {
    return <div className="cf-evolutionRuns__empty">{t('skills.evolutionRuns.noWorkspace')}</div>;
  }

  if (loading && runs.length === 0) {
    return <div className="cf-evolutionRuns__empty">{t('skills.evolutionRuns.loading')}</div>;
  }

  if (!runs.length) {
    return <div className="cf-evolutionRuns__empty">{t('skills.evolutionRuns.empty')}</div>;
  }

  return (
    <section className="cf-evolutionRuns" aria-label={t('skills.evolutionRuns.title')}>
      <div className="cf-evolutionRuns__head">
        <h4 className="cf-evolutionRuns__title">{t('skills.evolutionRuns.title')}</h4>
        <button type="button" className="cf-btn cf-btnGhost cf-btnSmall" onClick={() => void load()} disabled={loading}>
          {t('common.refresh')}
        </button>
      </div>
      <ul className="cf-evolutionRuns__list">
        {runs.map((run) => {
          const open = openId === run.runId;
          const statusKey = run.reverted ? 'reverted' : run.ok ? 'ok' : 'fail';
          return (
            <li key={run.runId} className={`cf-evolutionRuns__item cf-evolutionRuns__item--${statusKey}`}>
              <button
                type="button"
                className="cf-evolutionRuns__rowHead"
                onClick={() => setOpenId(open ? null : run.runId)}
                aria-expanded={open}
              >
                <span className="cf-evolutionRuns__chev">{open ? '▾' : '▸'}</span>
                <time dateTime={new Date(run.at).toISOString()}>{new Date(run.at).toLocaleString(locale)}</time>
                <span className="cf-evolutionRuns__badge">{t(`skills.evolutionRuns.status.${statusKey}`)}</span>
                {run.manual ? <span className="cf-evolutionRuns__tag">{t('skills.evolutionRuns.manual')}</span> : null}
                <span className="cf-evolutionRuns__summary">
                  {t('skills.evolutionRuns.diffCount', { count: run.aggregateDiff?.length ?? 0 })}
                </span>
              </button>
              {open ? (
                <div className="cf-evolutionRuns__body">
                  {run.phases?.map((p) => (
                    <div key={p.aspect} className="cf-evolutionRuns__phase">
                      <div className="cf-evolutionRuns__phaseTitle">
                        {t(`skills.evolutionRuns.aspect.${p.aspect}`)}
                        {!p.agentOk ? ` · ${t('skills.evolutionRuns.phaseFailed')}` : ''}
                        {p.diff?.length ? ` (${p.diff.length})` : ''}
                      </div>
                      {p.diff?.length ? (
                        <pre className="cf-evolutionRuns__pre">
                          {p.diff
                            .map((d) => `${d.kind === 'added' ? '+' : d.kind === 'deleted' ? '-' : '~'} ${d.relPath}`)
                            .join('\n')}
                        </pre>
                      ) : null}
                    </div>
                  ))}
                  {run.aggregateDiff?.length ? (
                    <>
                      <div className="cf-evolutionRuns__label">{t('skills.evolutionRuns.aggregateDiff')}</div>
                      <pre className="cf-evolutionRuns__pre">
                        {run.aggregateDiff
                          .map((d) => `${d.kind === 'added' ? '+' : d.kind === 'deleted' ? '-' : '~'} ${d.relPath}`)
                          .join('\n')}
                      </pre>
                    </>
                  ) : null}
                  {run.failureReason ? (
                    <div className="cf-sub">
                      {t('skills.evolutionRuns.reason')}: {run.failureReason}
                    </div>
                  ) : null}
                  {run.ok && !run.reverted ? (
                    <button
                      type="button"
                      className="cf-btn cf-btnGhost cf-btnSmall cf-evolutionRuns__revertBtn"
                      disabled={reverting === run.runId}
                      onClick={() => void revert(run.runId)}
                    >
                      {reverting === run.runId ? t('skills.evolutionRuns.reverting') : t('skills.evolutionRuns.revert')}
                    </button>
                  ) : null}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
};

export default EvolutionRunsPanel;
