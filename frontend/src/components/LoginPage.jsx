import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { TrendingUp } from 'lucide-react';
import { login } from '../services/api';
import { useAuth } from '../contexts/AuthContext';

export default function LoginPage() {
  const navigate = useNavigate();
  const { login: authLogin } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await login(email, password);
      const data = res.data || {};
      const token = data.access_token || data.accessToken || data.token;
      const userData = data.user ?? null;
      if (!token) {
        setError('Sunucu token döndürmedi');
        setLoading(false);
        return;
      }
      authLogin(token, userData);
      navigate('/', { replace: true });
    } catch (err) {
      const isTimeout = err.code === 'ECONNABORTED' || err.message?.includes('timeout');
      const isNetwork = err.code === 'ERR_NETWORK' || !err.response;
      if (isTimeout || isNetwork) {
        setError('Sunucu yanıt vermiyor. Backend\'in çalıştığından emin olun.');
      } else {
        setError(err.response?.data?.detail || err.message || 'Giriş başarısız');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-bnc-bg flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center justify-center gap-2 mb-8">
          <div className="w-10 h-10 rounded-xl bg-bnc-accent flex items-center justify-center">
            <TrendingUp className="w-5 h-5 text-bnc-bg" />
          </div>
          <span className="text-lg font-bold text-bnc-textPri tracking-wide">PORTFOLIO</span>
        </div>

        <div className="bnc-card p-6">
          <h1 className="text-xl font-bold text-bnc-textPri mb-1">Giriş Yap</h1>
          <p className="text-bnc-textTer text-sm mb-6">Hesabınıza giriş yapın</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-bnc-textSec mb-1.5">E-posta veya kullanıcı adı</label>
              <input type="text" value={email} onChange={(e) => setEmail(e.target.value)}
                className="bnc-input w-full" required autoComplete="username" />
            </div>
            <div>
              <label className="block text-xs font-medium text-bnc-textSec mb-1.5">Şifre</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                className="bnc-input w-full" required autoComplete="current-password" />
            </div>
            {error && <p className="text-xs text-bnc-red bg-bnc-red/10 border border-bnc-red/20 rounded-lg px-3 py-2">{error}</p>}
            <button type="submit" disabled={loading} className="bnc-btn-primary w-full disabled:opacity-50">
              {loading ? 'Giriş yapılıyor...' : 'Giriş Yap'}
            </button>
          </form>

          <div className="mt-5 pt-4 border-t border-bnc-border text-center">
            <Link to="/register" className="text-bnc-accent text-sm font-medium hover:underline">
              Hesabım yok, kayıt ol
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
