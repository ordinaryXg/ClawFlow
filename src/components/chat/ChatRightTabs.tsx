import { FC, useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import ChangeHistoryPanel from './ChangeHistoryPanel';
import ScrapePanel from './ScrapePanel';
import SimpleEmbeddedBrowser from './SimpleEmbeddedBrowser';
import WorkspaceFilesSplit from './WorkspaceFilesSplit';

type Props = {
  workspacePath: string | null;
  /** 右栏像素宽度（桌面三栏布局）；不传则沿用样式表默认 */
  widthPx?: number;
};

type TabKey = 'workspace' | 'browser' | 'changes' | 'scrape';

const ChatRightTabs: FC<Props> = ({ workspacePath, widthPx }) => {
  const { t } = useTranslation();
  const [active, setActive] = useState<TabKey>('workspace');
  const [embeddedNavigateUrl, setEmbeddedNavigateUrl] = useState<string | null>(null);

  const clearEmbeddedNavigate = useCallback(() => setEmbeddedNavigateUrl(null), []);

  useEffect(() => {
    const api = window.electronAPI;
    const off = api?.onEmbeddedBrowserNavigate?.((p) => {
      if (p?.url && typeof p.url === 'string') {
        setEmbeddedNavigateUrl(p.url);
        setActive('browser');
      }
    });
    return () => off?.();
  }, []);

  const tabs = useMemo(
    () => [
      { key: 'workspace' as const, label: t('chat.rightTabs.workspaceDir') },
      { key: 'browser' as const, label: t('chat.rightTabs.headlessBrowser') },
      { key: 'changes' as const, label: t('chat.rightTabs.changeLog') },
      { key: 'scrape' as const, label: t('chat.rightTabs.scrape') },
    ],
    [t]
  );

  return (
    <aside
      className="cf-chatRight"
      style={widthPx != null ? { width: widthPx, flexShrink: 0, minWidth: 0 } : undefined}
    >
      <div className="cf-chatRight__tabs" role="tablist" aria-label={t('chat.rightTabs.title')}>
        {tabs.map((it) => {
          const isActive = it.key === active;
          return (
            <button
              key={it.key}
              type="button"
              role="tab"
              aria-selected={isActive}
              className={isActive ? 'cf-chatRight__tab cf-chatRight__tab--active' : 'cf-chatRight__tab'}
              onClick={() => setActive(it.key)}
            >
              {it.label}
            </button>
          );
        })}
      </div>

      <div className="cf-chatRight__body" role="tabpanel">
        <div style={{ display: active === 'workspace' ? 'block' : 'none', height: '100%', minHeight: 0 }}>
          <WorkspaceFilesSplit workspacePath={workspacePath} />
        </div>
        <div style={{ display: active === 'browser' ? 'block' : 'none', height: '100%', minHeight: 0 }}>
          <SimpleEmbeddedBrowser
            externalNavigateUrl={embeddedNavigateUrl}
            onConsumedExternalNavigate={clearEmbeddedNavigate}
          />
        </div>
        <div style={{ display: active === 'changes' ? 'block' : 'none', height: '100%', minHeight: 0 }}>
          <ChangeHistoryPanel workspacePath={workspacePath} />
        </div>
        <div style={{ display: active === 'scrape' ? 'block' : 'none', height: '100%', minHeight: 0 }}>
          <ScrapePanel workspacePath={workspacePath} />
        </div>
      </div>
    </aside>
  );
};

export default ChatRightTabs;

