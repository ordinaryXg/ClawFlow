import { FC, useCallback, useEffect, useState } from 'react';
import { FileOutlined, FolderOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';

type Entry = { name: string; kind: 'file' | 'dir' };

type Props = {
  workspacePath: string | null;
  /** 嵌入分栏：占满父级高度；文件列表不滚动（仅对话区滚动） */
  embedFill?: boolean;
};

const StickyFileStrip: FC<Props> = ({ workspacePath, embedFill }) => {
  const { t } = useTranslation();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!workspacePath?.trim()) {
      setEntries([]);
      setErr(null);
      return;
    }
    setLoading(true);
    setErr(null);
    try {
      const res = await window.electronAPI?.workspaceListDir?.('');
      if (!res?.ok) {
        setErr(res?.error ?? t('sticky.fileListError'));
        setEntries([]);
        return;
      }
      const list = Array.isArray(res.entries) ? res.entries : [];
      setEntries(
        list
          .filter((e) => e && typeof e.name === 'string')
          .map((e) => ({ name: e.name, kind: (e.kind === 'dir' ? 'dir' : 'file') as Entry['kind'] }))
          .sort((a, b) => {
            if (a.kind !== b.kind) return a.kind === 'dir' ? -1 : 1;
            return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
          })
      );
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : t('sticky.fileListError'));
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [workspacePath, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const onOpen = async (rel: string) => {
    try {
      await window.electronAPI?.workspaceRevealInExplorer?.(rel);
    } catch {
      /* ignore */
    }
  };

  const rootClass = embedFill ? 'cf-stickyFiles cf-stickyFiles--embedFill' : 'cf-stickyFiles';

  if (!workspacePath) {
    return (
      <div className={embedFill ? `${rootClass} cf-stickyFiles--emptyEmbed` : 'cf-stickyFiles cf-stickyFiles--empty'}>
        <span className="cf-stickyFiles__hint">{t('sticky.pickWorkspaceFirst')}</span>
      </div>
    );
  }

  return (
    <div className={rootClass} role="region" aria-label={t('sticky.fileListAria')}>
      <div className="cf-stickyFiles__head">
        <span>{t('sticky.workspaceFiles')}</span>
        <button type="button" className="cf-stickyFiles__refresh" onClick={() => void load()} disabled={loading}>
          {loading ? '…' : t('sticky.refreshFiles')}
        </button>
      </div>
      {err ? <div className="cf-stickyFiles__err">{err}</div> : null}
      <ul className="cf-stickyFiles__list">
        {entries.length === 0 && !loading && !err ? (
          <li className="cf-stickyFiles__emptyRow">{t('sticky.fileListEmpty')}</li>
        ) : null}
        {entries.map((e) => {
          const rel = e.name;
          return (
            <li key={rel} className="cf-stickyFiles__row">
              <button
                type="button"
                className="cf-stickyFiles__rowBtn"
                onClick={() => void onOpen(rel)}
                title={rel}
              >
                {e.kind === 'dir' ? (
                  <FolderOutlined className="cf-stickyFiles__icon" aria-hidden />
                ) : (
                  <FileOutlined className="cf-stickyFiles__icon" aria-hidden />
                )}
                <span className="cf-stickyFiles__name">{rel}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
};

export default StickyFileStrip;
