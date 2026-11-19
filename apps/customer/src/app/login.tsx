import { errorMessage, loginIdToEmail } from '@takson/shared';
import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { BigButton, Field, Notice, Screen, Title } from '@/ui/kit';

/** 업체 계정 로그인. 계정은 관제가 만들어 준다 (설계 4장) */
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
    const { error: e } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (e) setError('아이디나 비밀번호가 맞지 않아요.');
  }

  return (
    <Screen>
      <Title>탁송 고객 로그인</Title>
      <Field label="아이디" value={loginId} onChangeText={setLoginId} autoCapitalize="none" autoCorrect={false} />
      <Field label="비밀번호" value={password} onChangeText={setPassword} secureTextEntry onSubmitEditing={submit} />
      {error && <Notice tone="danger">{error}</Notice>}
      <BigButton label="로그인" onPress={submit} busy={busy} disabled={!loginId || !password} />
      <Notice>계정이 없으면 탁송 회사(관제)에 요청해 주세요.</Notice>
    </Screen>
  );
}
