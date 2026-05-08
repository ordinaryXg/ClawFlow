import { FC, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useGatewayStore } from '../store/modules/gatewayStore';
import ToastHost from './common/ToastHost';

function navClass(isActive: boolean) {
  return isActive ? 'cf-navLink cf-navLinkActive' : 'cf-navLink';
}

const Layout: FC = () => {
  const { t } = useTranslation();
  const location = useLocation();
  const { status, fetchStatus } = useGatewayStore();

  useEffect(() => {
    void fetchStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  const dotStyle =
    status === 'running'
      ? { background: 'var(--green)', boxShadow: '0 0 0 4px rgba(30, 91, 69, 0.18)' }
      : status === 'stopped'
        ? { background: 'var(--subtle)', boxShadow: '0 0 0 4px rgba(110, 118, 129, 0.18)' }
        : undefined;

  const statusKey = status === 'running' ? 'running' : status === 'stopped' ? 'stopped' : 'unknown';

  return (
    <>
      <div className="cf-app">
        <aside className="cf-sidebar">
          <div className="cf-brand">
            <div className="cf-brandBadge" />
            <div>
              <h1 className="cf-brandTitle">ClawFlow</h1>
              <p className="cf-brandSub">{t('brand.tagline')}</p>
            </div>
          </div>

          <nav className="cf-nav">
            <NavLink to="/dashboard" className={({ isActive }) => navClass(isActive)}>
              <span>{t('nav.dashboard')}</span>
              <span className="cf-navHint">{t('nav.dashboardHint')}</span>
            </NavLink>
            <NavLink to="/chat" className={({ isActive }) => navClass(isActive)}>
              <span>{t('nav.chat')}</span>
              <span className="cf-navHint">{t('nav.chatHint')}</span>
            </NavLink>
            <NavLink to="/skills" className={({ isActive }) => navClass(isActive)}>
              <span>{t('nav.skills')}</span>
              <span className="cf-navHint">{t('nav.skillsHint')}</span>
            </NavLink>
            <NavLink to="/connectors" className={({ isActive }) => navClass(isActive)}>
              <span>{t('nav.connectors')}</span>
              <span className="cf-navHint">{t('nav.connectorsHint')}</span>
            </NavLink>
            <NavLink to="/settings" className={({ isActive }) => navClass(isActive)}>
              <span>{t('nav.settings')}</span>
              <span className="cf-navHint">{t('nav.settingsHint')}</span>
            </NavLink>
            <NavLink to="/states" className={({ isActive }) => navClass(isActive)}>
              <span>{t('nav.states')}</span>
              <span className="cf-navHint">{t('nav.statesHint')}</span>
            </NavLink>
          </nav>

          <div className="cf-sideFooter" role="button" tabIndex={0} onClick={() => void fetchStatus()}>
            <div className="cf-sideMeta">
              <b>{t('gateway.title')}</b>
              <span>{t('gateway.tapRefresh', { status: t(`gateway.${statusKey}`) })}</span>
            </div>
            <div className="cf-dot" style={dotStyle} />
          </div>
        </aside>

        <main className="cf-main">
          <Outlet />
        </main>
      </div>
      <ToastHost />
    </>
  );
};

export default Layout;
