import { FC, useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ScrapeJobRecord } from '../../shared/scrape-jobs';
import './scrapePanel.css';

type Props = { workspacePath: string | null };

function coerceJobs(raw: unknown): ScrapeJobRecord[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((x) => {
    if (!x || typeof x !== 'object') return false;
    const o = x as Record<string, unknown>;
    return (
      typeof o.id === 'string' &&
      typeof o.createdAt === 'number' &&
      typeof o.url === 'string' &&
      (o.status === 'ok' || o.status === 'error')
    );
  }) as ScrapeJobRecord[];
}

function sameWorkspacePath(a: string | null | undefined, b: string): boolean {
  if (!a?.trim()) return false;
  const x = a.replace(/\\/g, '/').replace(/\/+$/, '');
  const y = b.replace(/\\/g, '/').replace(/\/+$/, '');
  return x.toLowerCase() === y.toLowerCase();
}

const ScrapePanel: FC<Props> = ({ workspacePath }) => {
  const { t, i18n } = useTranslation();
  const [jobs, setJobs] = useState<ScrapeJobRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [previewText, setPreviewText] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const load = useCallback(async () => {
    if (!workspacePath?.trim()) {
      setJobs([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await window.electronAPI?.scrapeListJobs?.();
      setJobs(coerceJobs(res?.jobs));
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
    const off = window.electronAPI?.onScrapeJobsUpdated?.((p) => {
      if (workspacePath && sameWorkspacePath(workspacePath, p.workspaceRoot)) void load();
    });
    return () => off?.();
  }, [workspacePath, load]);

  const togglePreview = async (job: ScrapeJobRecord) => {
    const open = openId === job.id;
    if (open) {
      setOpenId(null);
      setPreviewText(null);
      return;
    }
    setOpenId(job.id);
    setPreviewText(null);
    if (job.status !== 'ok' || !job.artifactRelPath) {
      setPreviewText(job.errorMessage ?? t('chat.rightTabs.scrapeNoArtifact'));
      return;
    }
    setPreviewLoading(true);
    try {
      const r = await window.electronAPI?.scrapeReadArtifact?.({ jobId: job.id });
      if (r && 'ok' in r && r.ok) setPreviewText(r.text);
      else setPreviewText(String(r && 'error' in r ? r.error : t('chat.rightTabs.scrapeReadFail')));
    } finally {
      setPreviewLoading(false);
    }
  };

  if (!workspacePath) {
    return <div className="cf-sub">{t('chat.rightTabs.scrapeNoWs')}</div>;
  }

  if (loading && jobs.length === 0) {
    return <div className="cf-sub">{t('chat.rightTabs.scrapeLoading')}</div>;
  }

  if (error) {
    return <div className="cf-errorText">{error}</div>;
  }

  const locale = i18n.language?.startsWith('zh') ? 'zh-CN' : 'en-US';

  return (
    <div className="cf-scrapePanel">
      <div className="cf-scrapePanel__toolbar">
        <button type="button" className="cf-btn cf-btnGhost cf-btnSmall" onClick={() => void load()}>
          {t('common.refresh')}
        </button>
      </div>
      <p className="cf-scrapePanel__hint cf-sub">{t('chat.rightTabs.scrapeHint')}</p>
      {jobs.length === 0 ? (
        <div className="cf-sub">{t('chat.rightTabs.scrapeEmpty')}</div>
      ) : (
        <ul className="cf-scrapePanel__list">
          {jobs.map((job) => {
            const expanded = openId === job.id;
            return (
              <li key={job.id} className="cf-scrapePanel__item">
                <button type="button" className="cf-scrapePanel__head" onClick={() => void togglePreview(job)}>
                  <div className="cf-scrapePanel__title">{job.title || job.url}</div>
                  <div className="cf-scrapePanel__meta">
                    {new Date(job.createdAt).toLocaleString(locale)} ·{' '}
                    {job.status === 'ok'
                      ? t('chat.rightTabs.scrapeOk', { n: job.charsTotal ?? 0 })
                      : t('chat.rightTabs.scrapeErr')}
                  </div>
                </button>
                {job.status === 'ok' && job.excerpt ? <pre className="cf-scrapePanel__excerpt">{job.excerpt}</pre> : null}
                {job.status === 'error' && job.errorMessage ? (
                  <div className="cf-scrapePanel__err">{job.errorMessage}</div>
                ) : null}
                {expanded ? (
                  <div className="cf-scrapePanel__preview">
                    {previewLoading ? (
                      <div className="cf-sub">{t('chat.rightTabs.scrapePreviewLoading')}</div>
                    ) : (
                      <pre>{previewText ?? ''}</pre>
                    )}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

export default ScrapePanel;
