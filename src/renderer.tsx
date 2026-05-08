import ReactDOM from 'react-dom/client';
import './i18n';
import './index.css';
import './styles/ui.css';
import App from './App';

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);

root.render(<App />);
