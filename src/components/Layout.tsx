import { FC, useEffect } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useGatewayStore } from '../store/modules/gatewayStore';
import ToastHost from './common/ToastHost';

function navClass(isActive: boolean) {
  return isActive ? 'cf-navLink cf-navLinkActive' : 'cf-navLink';
}

const Layout: FC = () => {
  const location = useLocation();
  const { status, fetchStatus } = useGatewayStore();

  useEffect(() => {
    // 原型一致：侧栏底部展示 Gateway 状态；切页时顺便刷新一次（轻量）
    void fetchStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  const dotStyle =
    status === 'running'
      ? { background: 'var(--green)', boxShadow: '0 0 0 4px rgba(30, 91, 69, 0.18)' }
      : status === 'stopped'
        ? { background: 'var(--subtle)', boxShadow: '0 0 0 4px rgba(110, 118, 129, 0.18)' }
        : undefined;

  const statusText = status === 'running' ? 'running' : status === 'stopped' ? 'stopped' : 'unknown';

  return (
    <>
      <div className="cf-app">
        <aside className="cf-sidebar">
        <div className="cf-brand">
          <div className="cf-brandBadge" />
          <div>
            <h1 className="cf-brandTitle">ClawFlow</h1>
            <p className="cf-brandSub">桌面端工作助手</p>
          </div>
        </div>

        <nav className="cf-nav">
          <NavLink to="/dashboard" className={({ isActive }) => navClass(isActive)}>
            <span>Dashboard</span>
            <span className="cf-navHint">状态</span>
          </NavLink>
          <NavLink to="/chat" className={({ isActive }) => navClass(isActive)}>
            <span>Chat</span>
            <span className="cf-navHint">对话</span>
          </NavLink>
          <NavLink to="/skills" className={({ isActive }) => navClass(isActive)}>
            <span>Skills</span>
            <span className="cf-navHint">技能</span>
          </NavLink>
          <NavLink to="/connectors" className={({ isActive }) => navClass(isActive)}>
            <span>Connectors</span>
            <span className="cf-navHint">连接器</span>
          </NavLink>
          <NavLink to="/settings" className={({ isActive }) => navClass(isActive)}>
            <span>Settings</span>
            <span className="cf-navHint">偏好</span>
          </NavLink>
          <NavLink to="/states" className={({ isActive }) => navClass(isActive)}>
            <span>States</span>
            <span className="cf-navHint">空/错/载</span>
          </NavLink>
        </nav>

        <div className="cf-sideFooter" role="button" tabIndex={0} onClick={() => void fetchStatus()}>
          <div className="cf-sideMeta">
            <b>Gateway</b>
            <span>{statusText} · 点击刷新</span>
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
