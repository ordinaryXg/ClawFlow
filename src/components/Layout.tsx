import { FC, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Outlet, useNavigate } from 'react-router-dom';
import { useGatewayStore } from '../store/modules/gatewayStore';
import { useWorkspaceStore } from '../store/modules/workspaceStore';
import { useChatStore } from '../store/modules/chatStore';
import { startShellColumnDrag, usePersistedShellWidth } from '../hooks/usePersistedShellWidth';
import ErrorBoundary from './common/ErrorBoundary';
import ToastHost from './common/ToastHost';
import Titlebar from './Titlebar';
import ChatRightTabs from './chat/ChatRightTabs';
import WorkspaceSidebar from './WorkspaceSidebar';
import './layoutShell.css';

const MOBILE_BP = 980;

const SIDEBAR_W_KEY = 'clawflow.shell.sidebarW';
const RIGHT_W_KEY = 'clawflow.shell.rightW';
const SIDEBAR_DEFAULT = 320;
const SIDEBAR_MIN = 220;
const SIDEBAR_MAX = 520;
const RIGHT_DEFAULT = 360;
const RIGHT_MIN = 220;
const RIGHT_MAX = 560;

const Layout: FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { status, fetchStatus } = useGatewayStore();
  const refreshWorkspace = useWorkspaceStore((s) => s.refresh);
  const fetchConversations = useChatStore((s) => s.fetchConversations);
  const activeWorkspacePath = useWorkspaceStore((s) => s.activePath);

  const [sidebarW, setSidebarW] = usePersistedShellWidth(SIDEBAR_W_KEY, SIDEBAR_DEFAULT, SIDEBAR_MIN, SIDEBAR_MAX);
  const [rightW, setRightW] = usePersistedShellWidth(RIGHT_W_KEY, RIGHT_DEFAULT, RIGHT_MIN, RIGHT_MAX);

  const [isMobile, setIsMobile] = useState(
    typeof window !== 'undefined' ? window.matchMedia(`(max-width:${MOBILE_BP}px)`).matches : false
  );

  useEffect(() => {
    const mq = window.matchMedia(`(max-width:${MOBILE_BP}px)`);
    const onChange = () => {
      setIsMobile(mq.matches);
    };
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    void fetchStatus();
  }, [fetchStatus]);

  useEffect(() => {
    void refreshWorkspace();
  }, [refreshWorkspace]);

  useEffect(() => {
    const off = window.electronAPI?.onWorkspaceChanged?.(() => {
      void refreshWorkspace();
      void fetchConversations();
    });
    return () => off?.();
  }, [refreshWorkspace, fetchConversations]);

  useEffect(() => {
    const off = window.electronAPI?.onNavigate?.((path) => navigate(path));
    return () => off?.();
  }, [navigate]);

  const statusKey = status === 'running' ? 'running' : status === 'stopped' ? 'stopped' : 'unknown';

  return (
    <>
      <div className="cf-app cf-app--noSidebar">
        <div className="cf-mainColumn">
          {/* Windows titlebar overlay: draw menus + window controls in one row */}
          {!isMobile ? <Titlebar /> : null}
          {isMobile ? (
            <header className="cf-mobileBar" style={{ justifyContent: 'space-between' }}>
              <span className="cf-mobileBrand" role="button" tabIndex={0} onClick={() => navigate('/chat')}>
                ClawFlow
              </span>
              <button className="cf-btn cf-btnGhost cf-btnSmall" type="button" onClick={() => void fetchStatus()}>
                {t('gateway.tapRefresh', { status: t(`gateway.${statusKey}`) })}
              </button>
            </header>
          ) : null}

          <main className="cf-main">
            <div className="cf-shell">
              <WorkspaceSidebar
                sidebarWidthPx={isMobile ? 260 : sidebarW}
                trailingBorder={isMobile}
              />

              {!isMobile ? (
                <div
                  role="separator"
                  aria-orientation="vertical"
                  aria-label={t('layout.resizeSidebar')}
                  className="cf-shell__gutter"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    startShellColumnDrag(e.clientX, sidebarW, setSidebarW, SIDEBAR_MIN, SIDEBAR_MAX, false);
                  }}
                />
              ) : null}

              <section className="cf-shell__main">
                <div className={isMobile ? 'cf-shell__mainGrid cf-shell__mainGrid--stack' : 'cf-shell__mainGrid cf-shell__mainGrid--cols'}>
                  <div className="cf-shell__center">
                    <ErrorBoundary>
                      <Outlet />
                    </ErrorBoundary>
                  </div>
                  {!isMobile ? (
                    <>
                      <div
                        role="separator"
                        aria-orientation="vertical"
                        aria-label={t('layout.resizeRightPanel')}
                        className="cf-shell__gutter"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          startShellColumnDrag(e.clientX, rightW, setRightW, RIGHT_MIN, RIGHT_MAX, true);
                        }}
                      />
                      <ChatRightTabs workspacePath={activeWorkspacePath} widthPx={rightW} />
                    </>
                  ) : null}
                </div>
              </section>
            </div>
          </main>
        </div>
      </div>

      <ToastHost />
    </>
  );
};

export default Layout;
