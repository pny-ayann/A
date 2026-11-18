import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { supabase } from '../supabase';
import { unregisterPushToken } from '../push/register';
import { routeFor, type DriverProfile, type Route } from './gate';

type AuthState = {
  ready: boolean;
  session: Session | null;
  profile: DriverProfile | null;
  route: Route;
  reload: () => Promise<void>;
  signOut: () => Promise<void>;
};

const Ctx = createContext<AuthState | null>(null);

async function loadProfile(userId: string): Promise<DriverProfile | null> {
  const { data } = await supabase.from('profiles').select('id, role, name, driver_status').eq('id', userId).maybeSingle();
  return (data as DriverProfile | null) ?? null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<DriverProfile | null>(null);

  const apply = useCallback(async (s: Session | null) => {
    setSession(s);
    const p = s ? await loadProfile(s.user.id) : null;
    // 기사가 아닌 계정은 바로 로그아웃 (관제·고객 계정으로 기사 앱을 쓰지 못하게)
    if (s && routeFor(p) === 'not-driver') {
      await supabase.auth.signOut();
      setSession(null);
      setProfile(null);
    } else {
      setProfile(p);
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
    route: session ? routeFor(profile) : 'login',
    reload: async () => { const { data } = await supabase.auth.getSession(); await apply(data.session); },
    signOut: async () => { await unregisterPushToken(); await supabase.auth.signOut(); },
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const v = useContext(Ctx);
  if (!v) throw new Error('AuthProvider 밖에서 useAuth를 썼어요');
  return v;
}
