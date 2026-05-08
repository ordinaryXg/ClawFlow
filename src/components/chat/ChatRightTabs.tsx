import { FC, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

type Props = {
  workspacePath: string | null;
  /** 右栏像素宽度（桌面三栏布局）；不传则沿用样式表默认 */
  widthPx?: number;
};

type TabKey = 'workspace' | 'browser' | 'changes';

const ChatRightTabs: FC<Props> = ({ workspacePath, widthPx }) => {
  const { t } = useTranslation();
  const [active, setActive] = useState<TabKey>('workspace');

  const tabs = useMemo(
    () => [
      { key: 'workspace' as const, label: t('chat.rightTabs.workspaceDir') },
      { key: 'browser' as const, label: t('chat.rightTabs.headlessBrowser') },
      { key: 'changes' as const, label: t('chat.rightTabs.changeLog') },
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
        {active === 'workspace' ? (
          <div className="cf-chatRight__section">
            <div className="cf-chatRight__kv">
              <span className="cf-chatRight__k">{t('chat.rightTabs.workspacePath')}</span>
              <span className="cf-chatRight__v" title={workspacePath ?? ''}>
                {workspacePath ?? t('workspace.default')}
              </span>
            </div>
          </div>
        ) : null}

        {active === 'browser' ? (
          <div className="cf-chatRight__section">
            <div className="cf-sub">{t('chat.rightTabs.headlessBrowserHint')}</div>
          </div>
        ) : null}

        {active === 'changes' ? (
          <div className="cf-chatRight__section">
            <div className="cf-sub">{t('chat.rightTabs.changeLogHint')}</div>
          </div>
        ) : null}
      </div>
    </aside>
  );
};

export default ChatRightTabs;

