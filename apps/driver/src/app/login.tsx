import { errorMessage, loginIdToEmail } from '@takson/shared';
import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { routeFor, type DriverProfile } from '@/lib/auth/gate';
import { BigButton, Body, Field, Notice, Screen, Title } from '@/ui/kit';

export default function Login() {
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setError(null);
    let email: string;
    try { email = loginIdToEmail(loginId); } catch { setError(errorMessage('INVALID_LOGIN_ID')); return; }
    setBusy(true);
    const { data, error: e } = await supabase.auth.signInWithPassword({ email, password });
    if (e || !data.user) { setBusy(false); setError('아이디나 비밀번호가 맞지 않아요.'); return; }
    const { data: p } = await supabase.from('profiles').select('id, role, name, driver_status').eq('id', data.user.id).maybeSingle();
    if (routeFor(p as DriverProfile | null) === 'not-driver') {
      await supabase.auth.signOut();
      setError('기사 계정이 아니에요.');
    }
    setBusy(false);
  }

  return (
    <Screen>
      <Title>탁송 기사 로그인</Title>
      <Field label="아이디" value={loginId} onChangeText={setLoginId} autoCapitalize="none" autoCorrect={false} />
      <Field label="비밀번호" value={password} onChangeText={setPassword} secureTextEntry onSubmitEditing={submit} />
      {error && <Notice tone="danger">{error}</Notice>}
      <BigButton label="로그인" onPress={submit} busy={busy} disabled={!loginId || !password} />
      <Body sub>계정이 없으면 관제에 문의해 주세요.</Body>
    </Screen>
  );
}
