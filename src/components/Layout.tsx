import { FC } from 'react';
import { NavLink, Outlet } from 'react-router-dom';

const Layout: FC = () => {
  return (
    <div style={{ display: 'flex', height: '100vh' }}>
      {/* 左侧导航 */}
      <nav style={{
        width: 200,
        background: '#f5f5f5',
        borderRight: '1px solid #e0e0e0',
        padding: 16,
      }}>
        <h2 style={{ marginTop: 0, fontSize: 18 }}>ClawFlow</h2>
        <ul style={{ listStyle: 'none', padding: 0 }}>
          <li style={{ marginBottom: 8 }}>
            <NavLink to="/dashboard" style={({ isActive }) => ({
              display: 'block',
              padding: '8px 12px',
              borderRadius: 6,
              background: isActive ? '#e0e0e0' : 'transparent',
              textDecoration: 'none',
              color: '#333',
            })}>
              仪表盘
            </NavLink>
          </li>
          <li style={{ marginBottom: 8 }}>
            <NavLink to="/chat" style={({ isActive }) => ({
              display: 'block',
              padding: '8px 12px',
              borderRadius: 6,
              background: isActive ? '#e0e0e0' : 'transparent',
              textDecoration: 'none',
              color: '#333',
            })}>
              对话
            </NavLink>
          </li>
          <li style={{ marginBottom: 8 }}>
            <NavLink to="/skills" style={({ isActive }) => ({
              display: 'block',
              padding: '8px 12px',
              borderRadius: 6,
              background: isActive ? '#e0e0e0' : 'transparent',
              textDecoration: 'none',
              color: '#333',
            })}>
              技能管理
            </NavLink>
          </li>
        </ul>
      </nav>

      {/* 右侧内容区 */}
      <main style={{ flex: 1, padding: 24, overflow: 'auto' }}>
        <Outlet />
      </main>
    </div>
  );
};

export default Layout;
