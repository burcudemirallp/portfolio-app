import { createContext, useContext, useState, useCallback, useMemo } from 'react';
import { translations, defaultLanguage } from '../i18n';

const LanguageContext = createContext(null);

function interpolate(template, params) {
  if (!params) return template;
  return Object.entries(params).reduce(
    (str, [key, val]) => str.replace(new RegExp(`\\{${key}\\}`, 'g'), val),
    template
  );
}

export function LanguageProvider({ children }) {
  const [language, setLanguageState] = useState(() => {
    try {
      return localStorage.getItem('app_language') || defaultLanguage;
    } catch {
      return defaultLanguage;
    }
  });

  const setLanguage = useCallback((lang) => {
    setLanguageState(lang);
    try { localStorage.setItem('app_language', lang); } catch {}
  }, []);

  const t = useCallback((key, params) => {
    const val = translations[language]?.[key]
      ?? translations[defaultLanguage]?.[key]
      ?? key;
    if (typeof val === 'string') return interpolate(val, params);
    return val;
  }, [language]);

  const locale = useMemo(() => language === 'en' ? 'en-US' : 'tr-TR', [language]);

  const value = useMemo(() => ({ language, setLanguage, t, locale }), [language, setLanguage, t, locale]);

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used within LanguageProvider');
  return ctx;
}
