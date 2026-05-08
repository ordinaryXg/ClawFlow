import { FC, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Outlet, useNavigate } from 'react-router-dom';
import { useGatewayStore } from '../store/modules/gatewayStore';
import ErrorBoundary from './common/ErrorBoundary';
import ToastHost from './common/ToastHost';
import Titlebar from './Titlebar';

const MOBILE_BP = 980;

const Layout: FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { status, fetchStatus } = useGatewayStore();

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
    const off = window.electronAPI?.onNavigate?.((path) => navigate(path));
    return () => off?.();
  }, [navigate]);

  const dotStyle =
    status === 'running'
      ? { background: 'var(--green)', boxShadow: '0 0 0 4px rgba(30, 91, 69, 0.18)' }
      : status === 'stopped'
        ? { background: 'var(--subtle)', boxShadow: '0 0 0 4px rgba(110, 118, 129, 0.18)' }
        : undefined;

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
            <ErrorBoundary>
              <Outlet />
            </ErrorBoundary>
          </main>
        </div>
      </div>

      <ToastHost />
    </>
  );
};

export default Layout;
