import { FC, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ApiOutlined,
  AppstoreOutlined,
  DashboardOutlined,
  MenuFoldOutlined,
  MenuOutlined,
  MenuUnfoldOutlined,
  MessageOutlined,
  PartitionOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import { Button, Drawer, Menu } from 'antd';
import type { MenuProps } from 'antd';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useGatewayStore } from '../store/modules/gatewayStore';
import { useSettingsStore } from '../store/modules/settingsStore';
import ToastHost from './common/ToastHost';

const MOBILE_BP = 980;

const Layout: FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const appTheme = useSettingsStore((s) => s.theme);
  const { status, fetchStatus } = useGatewayStore();

  const [navCollapsed, setNavCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(
    typeof window !== 'undefined' ? window.matchMedia(`(max-width:${MOBILE_BP}px)`).matches : false
  );

  useEffect(() => {
    const mq = window.matchMedia(`(max-width:${MOBILE_BP}px)`);
    const onChange = () => {
      setIsMobile(mq.matches);
      if (!mq.matches) setMobileOpen(false);
    };
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    void fetchStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  const selectedPath = location.pathname === '/' ? '/dashboard' : location.pathname;

  const menuItems: MenuProps['items'] = useMemo(
    () => [
      { key: '/dashboard', icon: <DashboardOutlined />, label: t('nav.dashboard') },
      { key: '/chat', icon: <MessageOutlined />, label: t('nav.chat') },
      { key: '/skills', icon: <AppstoreOutlined />, label: t('nav.skills') },
      { key: '/connectors', icon: <ApiOutlined />, label: t('nav.connectors') },
      { key: '/settings', icon: <SettingOutlined />, label: t('nav.settings') },
      { key: '/states', icon: <PartitionOutlined />, label: t('nav.states') },
    ],
    [t]
  );

  const onMenuClick: MenuProps['onClick'] = (info) => {
    navigate(info.key);
    if (isMobile) setMobileOpen(false);
  };

  const dotStyle =
    status === 'running'
      ? { background: 'var(--green)', boxShadow: '0 0 0 4px rgba(30, 91, 69, 0.18)' }
      : status === 'stopped'
        ? { background: 'var(--subtle)', boxShadow: '0 0 0 4px rgba(110, 118, 129, 0.18)' }
        : undefined;

  const statusKey = status === 'running' ? 'running' : status === 'stopped' ? 'stopped' : 'unknown';
  const menuTheme = appTheme === 'light' ? 'light' : 'dark';

  const sideMenu = (
    <Menu
      className="cf-sideMenu"
      mode="inline"
      theme={menuTheme}
      selectedKeys={[selectedPath]}
      items={menuItems}
      onClick={onMenuClick}
      inlineCollapsed={!isMobile && navCollapsed}
      style={{ border: 'none', background: 'transparent', flex: 1, minHeight: 0 }}
    />
  );

  return (
    <>
      <div className={`cf-app${!isMobile && navCollapsed ? ' cf-app--navCollapsed' : ''}`}>
        {!isMobile ? (
          <aside className={`cf-sidebar${navCollapsed ? ' cf-sidebar--collapsed' : ''}`}>
            <div className="cf-brand">
              <div className="cf-brandBadge" />
              <div className="cf-brandText">
                <h1 className="cf-brandTitle">ClawFlow</h1>
                <p className="cf-brandSub">{t('brand.tagline')}</p>
              </div>
            </div>

            <div className="cf-sidebarCollapse">
              <button
                type="button"
                className="cf-btn cf-btnGhost cf-btnSmall cf-sidebarCollapseBtn"
                aria-expanded={!navCollapsed}
                aria-label={navCollapsed ? t('nav.expandNav') : t('nav.collapseNav')}
                onClick={() => setNavCollapsed((c) => !c)}
              >
                {navCollapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
              </button>
            </div>

            {sideMenu}

            <div
              className="cf-sideFooter"
              role="button"
              tabIndex={0}
              onClick={() => void fetchStatus()}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  void fetchStatus();
                }
              }}
            >
              <div className="cf-sideMeta">
                <b>{t('gateway.title')}</b>
                <span>{t('gateway.tapRefresh', { status: t(`gateway.${statusKey}`) })}</span>
              </div>
              <div className="cf-dot" style={dotStyle} />
            </div>
          </aside>
        ) : null}

        <div className="cf-mainColumn">
          {isMobile ? (
            <header className="cf-mobileBar">
              <Button
                type="text"
                icon={<MenuOutlined />}
                aria-label={t('nav.openMenu')}
                onClick={() => setMobileOpen(true)}
              />
              <span className="cf-mobileBrand">ClawFlow</span>
            </header>
          ) : null}
          <main className="cf-main">
            <Outlet />
          </main>
        </div>
      </div>

      {isMobile ? (
        <Drawer
          title={
            <div className="cf-drawerBrand">
              <div className="cf-brandBadge" />
              <span>ClawFlow</span>
            </div>
          }
          placement="left"
          width={280}
          open={mobileOpen}
          onClose={() => setMobileOpen(false)}
          destroyOnClose={false}
          styles={{ body: { padding: '8px 12px 16px' } }}
        >
          <Menu
            className="cf-sideMenu cf-sideMenu--drawer"
            mode="inline"
            theme={menuTheme}
            selectedKeys={[selectedPath]}
            items={menuItems}
            onClick={onMenuClick}
            style={{ border: 'none', background: 'transparent' }}
          />
          <div
            className="cf-sideFooter"
            style={{ marginTop: 14 }}
            role="button"
            tabIndex={0}
            onClick={() => void fetchStatus()}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                void fetchStatus();
              }
            }}
          >
            <div className="cf-sideMeta">
              <b>{t('gateway.title')}</b>
              <span>{t('gateway.tapRefresh', { status: t(`gateway.${statusKey}`) })}</span>
            </div>
            <div className="cf-dot" style={dotStyle} />
          </div>
        </Drawer>
      ) : null}

      <ToastHost />
    </>
  );
};

export default Layout;
