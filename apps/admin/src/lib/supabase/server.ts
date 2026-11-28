import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from './env';

/** 서버 컴포넌트·서버 액션용 (로그인한 직원 권한, RLS 적용) */
export async function serverClient() {
  const store = await cookies();
  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: list => {
        try {
          list.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          // 서버 컴포넌트에서는 쿠키를 쓸 수 없음. middleware가 세션을 갱신한다.
        }
      },
    },
  });
}

export type StaffProfile = { id: string; name: string; staff_level: 'admin' | 'operator' | 'accounting' };

/** 로그인한 직원 정보. 직원이 아니면 null */
export async function getStaffProfile(): Promise<StaffProfile | null> {
  const supabase = await serverClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from('profiles').select('id, name, role, staff_level').eq('id', user.id).single();
  if (!data || data.role !== 'staff') return null;
  return { id: data.id, name: data.name ?? '', staff_level: data.staff_level };
}
