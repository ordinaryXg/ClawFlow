import { FC, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useGatewayStore } from '../store/modules/gatewayStore';
import { useWorkspaceStore } from '../store/modules/workspaceStore';
import { useChatStore } from '../store/modules/chatStore';
import { startShellColumnDrag, usePersistedShellWidth } from '../hooks/usePersistedShellWidth';
import ErrorBoundary from './common/ErrorBoundary';
import ToastHost from './common/ToastHost';
import Titlebar from './Titlebar';
import ChatRightTabs from './chat/ChatRightTabs';
import WorkspaceSidebar from './WorkspaceSidebar';
import ViewModeFab from './ViewModeFab';
import StickyNoteShell from './sticky/StickyNoteShell';
import { ShellLayoutProvider } from '../context/ShellLayoutContext';
import { useShellViewStore } from '../store/modules/shellViewStore';
import './layoutShell.css';

const MOBILE_BP = 980;

const SIDEBAR_W_KEY = 'clawflow.shell.sidebarW';
const RIGHT_W_KEY = 'clawflow.shell.rightW';
const SIDEBAR_DEFAULT = 320;
const SIDEBAR_MIN = 220;
const SIDEBAR_MAX = 520;
const RIGHT_DEFAULT = 360;
const RIGHT_MIN = 220;
const RIGHT_MAX = 900;

const Layout: FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { status, fetchStatus } = useGatewayStore();
  const refreshWorkspace = useWorkspaceStore((s) => s.refresh);
  const fetchConversations = useChatStore((s) => s.fetchConversations);
  const activeWorkspacePath = useWorkspaceStore((s) => s.activePath);
  const shellViewMode = useShellViewStore((s) => s.mode);

  const [sidebarW, setSidebarW] = usePersistedShellWidth(SIDEBAR_W_KEY, SIDEBAR_DEFAULT, SIDEBAR_MIN, SIDEBAR_MAX);
  const [rightW, setRightW] = usePersistedShellWidth(RIGHT_W_KEY, RIGHT_DEFAULT, RIGHT_MIN, RIGHT_MAX);

  const [viewportNarrow, setViewportNarrow] = useState(
    typeof window !== 'undefined' ? window.matchMedia(`(max-width:${MOBILE_BP}px)`).matches : false
  );
  /** 便签模式窗口会缩到 <980px，此时仍按桌面壳层渲染，避免误判为移动布局 */
  const treatAsMobile =
    viewportNarrow && !(shellViewMode === 'alternate' && location.pathname === '/chat');

  const useStickyDesktopLayout =
    shellViewMode === 'alternate' && !treatAsMobile && location.pathname === '/chat';

  useEffect(() => {
    void window.electronAPI?.setShellViewWindowAppearance?.({ compact: useStickyDesktopLayout });
  }, [useStickyDesktopLayout]);

  useEffect(() => {
    const root = document.documentElement;
    if (useStickyDesktopLayout) root.classList.add('cf-stickyGlassRoot');
    else root.classList.remove('cf-stickyGlassRoot');
    return () => root.classList.remove('cf-stickyGlassRoot');
  }, [useStickyDesktopLayout]);

  useEffect(() => {
    const mq = window.matchMedia(`(max-width:${MOBILE_BP}px)`);
    const onChange = () => {
      setViewportNarrow(mq.matches);
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
      <div
        className={`cf-app cf-app--noSidebar${useStickyDesktopLayout ? ' cf-app--shellViewAlternate' : ''}`}
        data-shell-view={shellViewMode}
      >
        <div className="cf-mainColumn">
          {/* Windows titlebar overlay: draw menus + window controls in one row */}
          {!treatAsMobile && !useStickyDesktopLayout ? <Titlebar /> : null}
          {treatAsMobile ? (
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
            <ShellLayoutProvider variant={useStickyDesktopLayout ? 'alternate' : 'standard'}>
              {useStickyDesktopLayout ? (
                <ErrorBoundary>
                  <StickyNoteShell />
                </ErrorBoundary>
              ) : (
                <div className="cf-shell">
                  <WorkspaceSidebar
                    sidebarWidthPx={treatAsMobile ? 260 : sidebarW}
                    trailingBorder={treatAsMobile}
                  />

                  {!treatAsMobile ? (
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
                    <div
                      className={
                        treatAsMobile ? 'cf-shell__mainGrid cf-shell__mainGrid--stack' : 'cf-shell__mainGrid cf-shell__mainGrid--cols'
                      }
                    >
                      <div className="cf-shell__center">
                        <ErrorBoundary>
                          <Outlet />
                        </ErrorBoundary>
                      </div>
                      {!treatAsMobile ? (
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
              )}
            </ShellLayoutProvider>
          </main>
        </div>
      </div>

      <ViewModeFab />
      <ToastHost />
    </>
  );
};

export default Layout;
