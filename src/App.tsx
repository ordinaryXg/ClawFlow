import { FC } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import I18nThemeBootstrap from './components/I18nThemeBootstrap';
import Layout from './components/Layout';
import DashboardPage from './pages/DashboardPage';
import ChatPage from './pages/ChatPage';
import SkillsPage from './pages/SkillsPage';
import ConnectorsPage from './pages/ConnectorsPage';
import SettingsPage from './pages/SettingsPage';
import StatesPage from './pages/StatesPage';

const App: FC = () => {
  return (
    <HashRouter>
      <I18nThemeBootstrap />
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/chat" element={<ChatPage />} />
          <Route path="/skills" element={<SkillsPage />} />
          <Route path="/connectors" element={<ConnectorsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/states" element={<StatesPage />} />
        </Route>
      </Routes>
    </HashRouter>
  );
};

export default App;
