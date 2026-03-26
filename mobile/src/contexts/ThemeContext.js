import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { Appearance } from 'react-native';
import { getItem, setItem, KEYS } from '../utils/storage';

const DARK = {
  bg: '#0B0E11',
  surface: '#1E2329',
  surfaceAlt: '#2B3139',
  border: '#2B3139',
  accent: '#F0B90B',
  green: '#0ECB81',
  red: '#F6465D',
  textPri: '#EAECEF',
  textSec: '#B7BDC6',
  textTer: '#848E9C',
};

const LIGHT = {
  bg: '#FAFAFA',
  surface: '#FFFFFF',
  surfaceAlt: '#F5F5F5',
  border: '#EAECEF',
  accent: '#C99400',
  green: '#03A66D',
  red: '#CF304A',
  textPri: '#1E2329',
  textSec: '#474D57',
  textTer: '#848E9C',
};

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [darkMode, setDarkMode] = useState(Appearance.getColorScheme() === 'dark');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      const saved = await getItem(KEYS.DARK_MODE);
      if (saved !== null) {
        setDarkMode(saved === 'true');
      }
      setLoaded(true);
    })();
  }, []);

  const toggleDarkMode = useCallback(async () => {
    const next = !darkMode;
    setDarkMode(next);
    await setItem(KEYS.DARK_MODE, String(next));
  }, [darkMode]);

  const colors = useMemo(() => (darkMode ? DARK : LIGHT), [darkMode]);

  return (
    <ThemeContext.Provider value={{ darkMode, toggleDarkMode, loaded, colors }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
