import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { login as apiLogin } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';

export default function LoginScreen({ navigation }) {
  const { login: authLogin } = useAuth();
  const { colors } = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPw, setShowPw] = useState(false);

  const handleSubmit = async () => {
    setError('');
    if (!email || !password) { setError('Tüm alanları doldurun'); return; }
    setLoading(true);
    try {
      const res = await apiLogin(email, password);
      const data = res.data || {};
      const token = data.access_token || data.accessToken || data.token;
      if (!token) { setError('Sunucu token döndürmedi'); setLoading(false); return; }
      await authLogin(token, data.user ?? null);
    } catch (err) {
      const isNet = err.code === 'ERR_NETWORK' || err.code === 'ECONNABORTED' || !err.response;
      setError(isNet ? 'Sunucu yanıt vermiyor.' : (err.response?.data?.detail || 'Giriş başarısız'));
    } finally { setLoading(false); }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }} keyboardShouldPersistTaps="handled">
        <View style={{ paddingHorizontal: 24 }}>
          <View style={{ alignItems: 'center', marginBottom: 32 }}>
            <View style={{ width: 56, height: 56, borderRadius: 16, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
              <Text style={{ fontSize: 24, fontWeight: '900', color: '#0B0E11' }}>P</Text>
            </View>
            <Text style={{ fontSize: 24, fontWeight: '800', color: colors.textPri }}>Portfolio Tracker</Text>
            <Text style={{ fontSize: 14, color: colors.textTer, marginTop: 4 }}>Hesabınıza giriş yapın</Text>
          </View>

          <View style={{ backgroundColor: colors.surface, borderRadius: 20, padding: 24 }}>
            <Text style={{ fontSize: 12, fontWeight: '600', color: colors.textSec, marginBottom: 6 }}>E-posta veya kullanıcı adı</Text>
            <TextInput value={email} onChangeText={setEmail} autoCapitalize="none" autoCorrect={false}
              placeholderTextColor={colors.textTer} placeholder="ornek@email.com"
              style={{ backgroundColor: colors.surfaceAlt, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, fontSize: 15, color: colors.textPri, marginBottom: 16 }} />

            <Text style={{ fontSize: 12, fontWeight: '600', color: colors.textSec, marginBottom: 6 }}>Şifre</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surfaceAlt, borderRadius: 12, marginBottom: 8 }}>
              <TextInput value={password} onChangeText={setPassword} secureTextEntry={!showPw}
                placeholderTextColor={colors.textTer} placeholder="••••••"
                style={{ flex: 1, paddingHorizontal: 16, paddingVertical: 14, fontSize: 15, color: colors.textPri }} />
              <TouchableOpacity onPress={() => setShowPw(!showPw)} style={{ paddingRight: 14 }}>
                <Feather name={showPw ? 'eye-off' : 'eye'} size={18} color={colors.textTer} />
              </TouchableOpacity>
            </View>

            {error ? <Text style={{ fontSize: 13, color: colors.red, marginBottom: 12 }}>{error}</Text> : null}

            <TouchableOpacity onPress={handleSubmit} disabled={loading}
              style={{ backgroundColor: colors.accent, borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 8, opacity: loading ? 0.5 : 1 }}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: '#0B0E11' }}>{loading ? 'Giriş yapılıyor...' : 'Giriş Yap'}</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => navigation.navigate('Register')} style={{ alignItems: 'center', marginTop: 16 }}>
              <Text style={{ fontSize: 13, color: colors.accent }}>Hesabım yok, kayıt ol</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
