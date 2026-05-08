import ReactDOM from 'react-dom/client';
import 'antd/dist/reset.css';
import './i18n';
import './index.css';
import './styles/global.css';
import './styles/ui.css';
import App from './App';

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);

root.render(<App />);
