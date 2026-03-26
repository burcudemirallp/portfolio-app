import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { setAuthToken, setOnAuthLogout, getMe } from '../services/api';
import { getItem, setItem, removeItem, multiRemove, KEYS } from '../utils/storage';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setTokenState] = useState(null);
  const [loading, setLoading] = useState(true);

  // Load token from storage on mount
  useEffect(() => {
    (async () => {
      try {
        const savedToken = await getItem(KEYS.TOKEN);
        if (savedToken) {
          setAuthToken(savedToken);
          setTokenState(savedToken);
          const savedUser = await getItem(KEYS.USER);
          if (savedUser) {
            try {
              const parsed = JSON.parse(savedUser);
              if (parsed?.id) setUser(parsed);
            } catch {}
          }
          try {
            const res = await getMe();
            setUser(res.data);
            await setItem(KEYS.USER, JSON.stringify(res.data));
          } catch (err) {
            if (err.response?.status === 401) {
              setTokenState(null);
              setUser(null);
              await multiRemove([KEYS.TOKEN, KEYS.USER]);
            }
          }
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Register auth-logout callback
  const handleForceLogout = useCallback(() => {
    setTokenState(null);
    setUser(null);
  }, []);

  useEffect(() => {
    setOnAuthLogout(handleForceLogout);
    return () => setOnAuthLogout(null);
  }, [handleForceLogout]);

  const login = useCallback(async (newToken, userData) => {
    setAuthToken(newToken);
    await setItem(KEYS.TOKEN, newToken);
    if (userData) await setItem(KEYS.USER, JSON.stringify(userData));
    setTokenState(newToken);
    setUser(userData || null);
    setLoading(false);
  }, []);

  const switchToUser = useCallback(async (newToken, newUserData) => {
    const curToken = await getItem(KEYS.TOKEN);
    const curUser = await getItem(KEYS.USER);
    if (curToken) await setItem(KEYS.ADMIN_TOKEN, curToken);
    if (curUser) await setItem(KEYS.ADMIN_USER, curUser);
    await setItem(KEYS.ACTING_AS, 'true');
    await login(newToken, newUserData);
  }, [login]);

  const switchBackToAdmin = useCallback(async () => {
    const adminToken = await getItem(KEYS.ADMIN_TOKEN);
    const adminUser = await getItem(KEYS.ADMIN_USER);
    await multiRemove([KEYS.ADMIN_TOKEN, KEYS.ADMIN_USER, KEYS.ACTING_AS]);
    if (adminToken) {
      let userData = null;
      try {
        if (adminUser) userData = JSON.parse(adminUser);
      } catch {}
      await login(adminToken, userData);
    } else {
      await logout();
    }
  }, [login]);

  const isActingAs = useCallback(async () => {
    const val = await getItem(KEYS.ACTING_AS);
    return val === 'true';
  }, []);

  const logout = useCallback(async () => {
    setAuthToken(null);
    setTokenState(null);
    setUser(null);
    await multiRemove([
      KEYS.TOKEN, KEYS.USER,
      KEYS.ADMIN_TOKEN, KEYS.ADMIN_USER, KEYS.ACTING_AS,
    ]);
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, loading, login, logout, switchToUser, switchBackToAdmin, isActingAs }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
