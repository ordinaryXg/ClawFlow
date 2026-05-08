import { FC, useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

type Entry = {
  id: string;
  at: number;
  conversationId: string;
  title: string;
  userPreview: string;
  assistantExcerpt: string;
};

const ChangeHistoryPanel: FC<{ workspacePath: string | null }> = ({ workspacePath }) => {
  const { t, i18n } = useTranslation();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

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
    return () => window.removeEventListener('cf-workspace-changelog-updated', onUpd);
  }, [load]);

  if (!workspacePath) {
    return <div className="cf-sub">{t('chat.rightTabs.changeLogNoWs')}</div>;
  }

  if (loading && entries.length === 0) {
    return <div className="cf-sub">{t('chat.rightTabs.changeLogLoading')}</div>;
  }

  if (error) {
    return <div className="cf-errorText">{error}</div>;
  }

  if (entries.length === 0) {
    return <div className="cf-sub">{t('chat.rightTabs.changeLogEmpty')}</div>;
  }

  const locale = i18n.language?.startsWith('zh') ? 'zh-CN' : 'en-US';

  return (
    <div className="cf-changeLog">
      <div className="cf-changeLog__toolbar">
        <button type="button" className="cf-btn cf-btnGhost cf-btnSmall" onClick={() => void load()}>
          {t('common.refresh')}
        </button>
      </div>
      <ul className="cf-changeLog__list">
        {entries.map((e) => {
          const open = openId === e.id;
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
                <span className="cf-changeLog__title">{e.title}</span>
              </button>
              {open ? (
                <div className="cf-changeLog__body">
                  <div className="cf-changeLog__label">{t('chat.rightTabs.changeUser')}</div>
                  <pre className="cf-changeLog__pre">{e.userPreview || '—'}</pre>
                  <div className="cf-changeLog__label">{t('chat.rightTabs.changeAssistant')}</div>
                  <pre className="cf-changeLog__pre">{e.assistantExcerpt || '—'}</pre>
                  <div className="cf-changeLog__meta cf-sub">
                    {t('chat.rightTabs.changeConvId')}: {e.conversationId}
                  </div>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
};

export default ChangeHistoryPanel;
