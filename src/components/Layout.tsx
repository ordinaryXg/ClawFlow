import { FC, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Outlet, useNavigate } from 'react-router-dom';
import { useGatewayStore } from '../store/modules/gatewayStore';
import { useWorkspaceStore } from '../store/modules/workspaceStore';
import { useChatStore } from '../store/modules/chatStore';
import ErrorBoundary from './common/ErrorBoundary';
import ToastHost from './common/ToastHost';
import Titlebar from './Titlebar';
import ChatRightTabs from './chat/ChatRightTabs';
import WorkspaceSidebar from './WorkspaceSidebar';
import './layoutShell.css';

const MOBILE_BP = 980;

const Layout: FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { status, fetchStatus } = useGatewayStore();
  const refreshWorkspace = useWorkspaceStore((s) => s.refresh);
  const fetchConversations = useChatStore((s) => s.fetchConversations);
  const activeWorkspacePath = useWorkspaceStore((s) => s.activePath);

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
              <WorkspaceSidebar />

              <section className="cf-shell__main">
                <div className="cf-shell__mainGrid">
                  <div className="cf-shell__center">
                    <ErrorBoundary>
                      <Outlet />
                    </ErrorBoundary>
                  </div>
                  <ChatRightTabs workspacePath={activeWorkspacePath} />
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
