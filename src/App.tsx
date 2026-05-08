import { FC } from 'react';
import { ConfigProvider } from 'antd';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import I18nThemeBootstrap from './components/I18nThemeBootstrap';
import Layout from './components/Layout';
import DashboardPage from './pages/DashboardPage';
import ChatPage from './pages/ChatPage';
import SkillsPage from './pages/SkillsPage';
import ConnectorsPage from './pages/ConnectorsPage';
import SettingsPage from './pages/SettingsPage';
import { getAntdTheme } from './styles/theme';
import { useSettingsStore } from './store/modules/settingsStore';

const App: FC = () => {
  const theme = useSettingsStore((s) => s.theme);
  return (
    <ConfigProvider theme={getAntdTheme(theme)}>
      <HashRouter>
        <I18nThemeBootstrap />
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<Navigate to="/chat" replace />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/chat" element={<ChatPage />} />
            <Route path="/skills" element={<SkillsPage />} />
            <Route path="/connectors" element={<ConnectorsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Route>
        </Routes>
      </HashRouter>
    </ConfigProvider>
  );
};

export default App;
