import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { supabase } from '../supabase';
import { unregisterPushToken } from '../push/register';
import { routeFor, type CustomerProfile, type Route } from './gate';

type AuthState = {
  ready: boolean;
  session: Session | null;
  profile: CustomerProfile | null;
  /** 내 업체 이름 (내 정보 화면) */
  companyName: string | null;
  route: Route;
  /** 프로필을 다시 불러오기 (다시 시도 화면) */
  retry: () => Promise<void>;
  signOut: () => Promise<void>;
};

const Ctx = createContext<AuthState | null>(null);

/** 프로필 읽기. 네트워크·서버 오류면 failed (프로필이 없는 것과 구분) */
export async function loadProfile(userId: string): Promise<{ profile: CustomerProfile | null; failed: boolean }> {
  const { data, error } = await supabase.from('profiles').select('id, role, name, company_id').eq('id', userId).maybeSingle();
  if (error) return { profile: null, failed: true };
  return { profile: (data as CustomerProfile | null) ?? null, failed: false };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [companyName, setCompanyName] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  const apply = useCallback(async (s: Session | null) => {
    setSession(s);
    const r = s ? await loadProfile(s.user.id) : { profile: null, failed: false };
    const p = r.profile;
    setLoadFailed(r.failed);
    setProfile(p);
    if (p?.company_id) {
      const { data } = await supabase.from('companies').select('name').eq('id', p.company_id).maybeSingle();
      setCompanyName((data as { name: string } | null)?.name ?? null);
    } else {
      setCompanyName(null);
    }
    setReady(true);
  }, []);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => apply(data.session));
    const { data } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') void apply(s);
      else if (event === 'TOKEN_REFRESHED') setSession(s);
    });
    return () => data.subscription.unsubscribe();
  }, [apply]);

  const value: AuthState = {
    ready,
    session,
    profile,
    companyName,
    route: routeFor(profile, !!session, loadFailed),
    retry: () => apply(session),
    // 로그아웃 전에 이 휴대폰의 알림 등록을 지운다 (다른 사람이 쓰면 앞사람 알림이 오지 않게)
    signOut: async () => { await unregisterPushToken(); await supabase.auth.signOut(); },
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const v = useContext(Ctx);
  if (!v) throw new Error('AuthProvider 밖에서 useAuth를 썼어요');
  return v;
}
