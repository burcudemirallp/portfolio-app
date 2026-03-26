import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { register as apiRegister } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';

export default function RegisterScreen({ navigation }) {
  const { login: authLogin } = useAuth();
  const { colors } = useTheme();
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    setError('');
    if (!email || !username || !password || !confirm) { setError('Tüm alanları doldurun'); return; }
    if (password !== confirm) { setError('Şifreler eşleşmiyor'); return; }
    if (password.length < 6) { setError('Şifre en az 6 karakter olmalı'); return; }
    setLoading(true);
    try {
      const res = await apiRegister({ email, username, password });
      await authLogin(res.data.access_token, res.data.user);
    } catch (err) {
      setError(err.response?.data?.detail || 'Kayıt başarısız');
    } finally { setLoading(false); }
  };

  const F = ({ label, val, set, kbt, secure, ph }) => (
    <View style={{ marginBottom: 14 }}>
      <Text style={{ fontSize: 12, fontWeight: '600', color: colors.textSec, marginBottom: 6 }}>{label}</Text>
      <TextInput value={val} onChangeText={set} autoCapitalize="none" keyboardType={kbt} secureTextEntry={secure}
        placeholder={ph} placeholderTextColor={colors.textTer}
        style={{ backgroundColor: colors.surfaceAlt, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, fontSize: 15, color: colors.textPri }} />
    </View>
  );

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }} keyboardShouldPersistTaps="handled">
        <View style={{ paddingHorizontal: 24 }}>
          <View style={{ alignItems: 'center', marginBottom: 24 }}>
            <Text style={{ fontSize: 24, fontWeight: '800', color: colors.textPri }}>Kayıt Ol</Text>
            <Text style={{ fontSize: 14, color: colors.textTer, marginTop: 4 }}>Yeni hesap oluşturun</Text>
          </View>

          <View style={{ backgroundColor: colors.surface, borderRadius: 20, padding: 24 }}>
            <F label="E-posta" val={email} set={setEmail} kbt="email-address" ph="ornek@email.com" />
            <F label="Kullanıcı adı" val={username} set={setUsername} ph="kullaniciadi" />
            <F label="Şifre" val={password} set={setPassword} secure ph="••••••" />
            <F label="Şifre Tekrar" val={confirm} set={setConfirm} secure ph="••••••" />

            {error ? <Text style={{ fontSize: 13, color: colors.red, marginBottom: 8 }}>{error}</Text> : null}

            <TouchableOpacity onPress={handleSubmit} disabled={loading}
              style={{ backgroundColor: colors.green, borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 4, opacity: loading ? 0.5 : 1 }}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: '#fff' }}>{loading ? 'Kaydediliyor...' : 'Kayıt Ol'}</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => navigation.navigate('Login')} style={{ alignItems: 'center', marginTop: 16 }}>
              <Text style={{ fontSize: 13, color: colors.accent }}>Zaten hesabım var, giriş yap</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
