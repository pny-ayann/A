import { loginIdToEmail } from '@takson/shared';
import { router } from 'expo-router';
import { useState } from 'react';
import { validateSignup, type SignupForm } from '@/lib/auth/signup';
import { supabase } from '@/lib/supabase';
import { BigButton, Body, Field, Notice, Screen, Title } from '@/ui/kit';

export default function Signup() {
  const [f, setF] = useState<SignupForm>({ loginId: '', password: '', password2: '', name: '', phone: '' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof SignupForm) => (v: string) => setF(cur => ({ ...cur, [k]: v }));

  async function submit() {
    const problem = validateSignup(f);
    if (problem) { setError(problem); return; }
    setError(null);
    setBusy(true);
    const { data, error: e } = await supabase.auth.signUp({
      email: loginIdToEmail(f.loginId),
      password: f.password,
      options: { data: { name: f.name.trim(), phone: f.phone.trim() } },
    });
    setBusy(false);
    if (e) {
      setError(/registered|exists/i.test(e.message) ? '이미 쓰는 아이디예요.' : '가입하지 못했어요. 잠시 후 다시 시도해 주세요.');
      return;
    }
    // 이메일 확인이 켜져 있으면 세션이 없다 (개발 서버 설정 문제)
    if (!data.session) setError('가입은 됐지만 바로 로그인되지 않았어요. 관제에 문의해 주세요.');
    // 세션이 생기면 화면이 저절로 '승인 대기'로 바뀐다. 거기서 서류를 찍는다.
  }

  return (
    <Screen>
      <Title>기사 가입 신청</Title>
      <Body sub>신청 뒤 면허증과 보험 서류를 찍어 올리면, 관제가 확인하고 승인해요.</Body>
      <Field label="아이디 (영문 소문자·숫자·_ 3~20자)" value={f.loginId} onChangeText={set('loginId')} autoCapitalize="none" autoCorrect={false} />
      <Field label="비밀번호 (8자 이상)" value={f.password} onChangeText={set('password')} secureTextEntry />
      <Field label="비밀번호 확인" value={f.password2} onChangeText={set('password2')} secureTextEntry />
      <Field label="이름" value={f.name} onChangeText={set('name')} />
      <Field label="전화번호" value={f.phone} onChangeText={set('phone')} keyboardType="phone-pad" />
      {error && <Notice tone="danger">{error}</Notice>}
      <BigButton label="가입 신청" onPress={submit} busy={busy} />
      <BigButton label="로그인으로 돌아가기" tone="plain" onPress={() => router.back()} />
    </Screen>
  );
}
