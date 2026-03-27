import { useState } from 'react';
import { Link } from 'react-router-dom';
import { TrendingUp } from 'lucide-react';
import { register } from '../services/api';
import { useAuth } from '../contexts/AuthContext';

export default function RegisterPage() {
  const { login: authLogin } = useAuth();
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (password !== confirmPassword) { setError('Şifreler eşleşmiyor'); return; }
    setLoading(true);
    try {
      const res = await register({ email, username, password });
      authLogin(res.data.access_token, res.data.user);
    } catch (err) {
      setError(err.response?.data?.detail || err.message || 'Kayıt başarısız');
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
          <h1 className="text-xl font-bold text-bnc-textPri mb-1">Kayıt Ol</h1>
          <p className="text-bnc-textTer text-sm mb-6">Yeni hesap oluşturun</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-bnc-textSec mb-1.5">E-posta</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                className="bnc-input w-full" required />
            </div>
            <div>
              <label className="block text-xs font-medium text-bnc-textSec mb-1.5">Kullanıcı adı</label>
              <input type="text" value={username} onChange={(e) => setUsername(e.target.value)}
                className="bnc-input w-full" required />
            </div>
            <div>
              <label className="block text-xs font-medium text-bnc-textSec mb-1.5">Şifre</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                className="bnc-input w-full" required minLength={6} />
            </div>
            <div>
              <label className="block text-xs font-medium text-bnc-textSec mb-1.5">Şifre Tekrar</label>
              <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
                className="bnc-input w-full" required minLength={6} />
            </div>
            {error && <p className="text-xs text-bnc-red bg-bnc-red/10 border border-bnc-red/20 rounded-lg px-3 py-2">{error}</p>}
            <button type="submit" disabled={loading} className="bnc-btn-primary w-full disabled:opacity-50">
              {loading ? 'Kaydediliyor...' : 'Kayıt Ol'}
            </button>
          </form>

          <div className="mt-5 pt-4 border-t border-bnc-border text-center">
            <Link to="/login" className="text-bnc-accent text-sm font-medium hover:underline">
              Zaten hesabım var, giriş yap
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
