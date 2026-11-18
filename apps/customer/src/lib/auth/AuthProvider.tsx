import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { supabase } from '../supabase';
import { routeFor, type CustomerProfile, type Route } from './gate';

type AuthState = {
  ready: boolean;
  session: Session | null;
  profile: CustomerProfile | null;
  /** 내 업체 이름 (내 정보 화면) */
  companyName: string | null;
  route: Route;
  signOut: () => Promise<void>;
};

const Ctx = createContext<AuthState | null>(null);

export async function loadProfile(userId: string): Promise<CustomerProfile | null> {
  const { data } = await supabase.from('profiles').select('id, role, name, company_id').eq('id', userId).maybeSingle();
  return (data as CustomerProfile | null) ?? null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [companyName, setCompanyName] = useState<string | null>(null);

  const apply = useCallback(async (s: Session | null) => {
    setSession(s);
    const p = s ? await loadProfile(s.user.id) : null;
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
    route: routeFor(profile, !!session),
    signOut: async () => { await supabase.auth.signOut(); },
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const v = useContext(Ctx);
  if (!v) throw new Error('AuthProvider 밖에서 useAuth를 썼어요');
  return v;
}
