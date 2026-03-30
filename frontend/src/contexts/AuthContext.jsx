import { createContext, useContext, useState, useEffect } from 'react';
import { setAuthToken, getMe } from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setTokenState] = useState(() => localStorage.getItem('portfolio_token'));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (token) {
      setAuthToken(token);
      const savedUser = localStorage.getItem('portfolio_user');
      // Girişten hemen sonra veya sayfa yenilendiğinde user varsa ekranı bloklama
      if (savedUser) {
        try {
          const parsed = JSON.parse(savedUser);
          if (parsed?.id) {
            setUser(parsed);
            setLoading(false);
          }
        } catch (_) {}
      }
      const timeout = setTimeout(() => setLoading(false), 8000);
      getMe()
        .then((res) => {
          setUser(res.data);
          localStorage.setItem('portfolio_user', JSON.stringify(res.data));
        })
        .catch((err) => {
          // Sadece 401 (token geçersiz) ise çıkış yap; ağ hatası vb. oturumu silme
          if (err.response?.status === 401) {
            setTokenState(null);
            setUser(null);
            localStorage.removeItem('portfolio_token');
            localStorage.removeItem('portfolio_user');
          }
        })
        .finally(() => {
          clearTimeout(timeout);
          setLoading(false);
        });
    } else {
      setAuthToken(null);
      setUser(null);
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    const onLogout = () => {
      setTokenState(null);
      setUser(null);
    };
    window.addEventListener('auth-logout', onLogout);
    return () => window.removeEventListener('auth-logout', onLogout);
  }, []);

  const login = (newToken, userData) => {
    setAuthToken(newToken);
    localStorage.setItem('portfolio_token', newToken);
    if (userData) localStorage.setItem('portfolio_user', JSON.stringify(userData));
    setTokenState(newToken);
    setUser(userData || null);
    setLoading(false); // Giriş sonrası ekranın takılmaması için hemen kapat
  };

  /** Admin: başka kullanıcı olarak geç. Mevcut token/user sessionStorage'a saklanır. */
  const switchToUser = (newToken, newUserData) => {
    const curToken = localStorage.getItem('portfolio_token');
    const curUser = localStorage.getItem('portfolio_user');
    if (curToken) sessionStorage.setItem('portfolio_admin_token', curToken);
    if (curUser) sessionStorage.setItem('portfolio_admin_user', curUser);
    sessionStorage.setItem('portfolio_acting_as', 'true');
    login(newToken, newUserData);
  };

  /** Admin: önceki admin oturumuna dön (sessionStorage'dan geri yükle). */
  const switchBackToAdmin = () => {
    const adminToken = sessionStorage.getItem('portfolio_admin_token');
    const adminUser = sessionStorage.getItem('portfolio_admin_user');
    sessionStorage.removeItem('portfolio_admin_token');
    sessionStorage.removeItem('portfolio_admin_user');
    sessionStorage.removeItem('portfolio_acting_as');
    if (adminToken) {
      let userData = null;
      try {
        if (adminUser) userData = JSON.parse(adminUser);
      } catch (_) {}
      login(adminToken, userData);
    } else {
      logout();
    }
  };

  const isActingAs = () => typeof window !== 'undefined' && sessionStorage.getItem('portfolio_acting_as') === 'true';

  const refreshUser = async () => {
    try {
      const res = await getMe();
      setUser(res.data);
      localStorage.setItem('portfolio_user', JSON.stringify(res.data));
    } catch (e) { console.error('Kullanıcı bilgisi yenilenemedi', e); }
  };

  const logout = () => {
    setAuthToken(null);
    setTokenState(null);
    setUser(null);
    localStorage.removeItem('portfolio_token');
    localStorage.removeItem('portfolio_user');
    sessionStorage.removeItem('portfolio_admin_token');
    sessionStorage.removeItem('portfolio_admin_user');
    sessionStorage.removeItem('portfolio_acting_as');
    window.dispatchEvent(new Event('auth-logout'));
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, login, logout, switchToUser, switchBackToAdmin, isActingAs, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
