import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from './locales/en.json';
import zh from './locales/zh.json';

function getStoredLanguage(): 'zh' | 'en' {
  if (typeof window === 'undefined') return 'zh';
  try {
    const raw = localStorage.getItem('clawflow-settings');
    if (!raw) return 'zh';
    const parsed = JSON.parse(raw) as { language?: string };
    return parsed.language === 'en' ? 'en' : 'zh';
  } catch {
    return 'zh';
  }
}

void i18n.use(initReactI18next).init({
  resources: {
    zh: { translation: zh },
    en: { translation: en },
  },
  lng: getStoredLanguage(),
  fallbackLng: 'zh',
  interpolation: { escapeValue: false },
});

export default i18n;
