'use server';
import { redirect } from 'next/navigation';
import { errorMessage, loginIdToEmail } from '@takson/shared';
import { serverClient } from '@/lib/supabase/server';

export type LoginState = { message: string } | null;

export async function login(_prev: LoginState, form: FormData): Promise<LoginState> {
  const loginId = String(form.get('loginId') ?? '');
  const password = String(form.get('password') ?? '');
  let email: string;
  try {
    email = loginIdToEmail(loginId);
  } catch {
    return { message: errorMessage('INVALID_LOGIN_ID') };
  }
  const supabase = await serverClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) return { message: '아이디나 비밀번호가 맞지 않아요.' };

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', data.user.id).single();
  if (profile?.role !== 'staff') {
    await supabase.auth.signOut();
    return { message: '직원 계정이 아니에요.' };
  }
  redirect('/orders');
}

export async function logout() {
  const supabase = await serverClient();
  await supabase.auth.signOut();
  redirect('/login');
}
