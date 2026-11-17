import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { gateDecision, routeAccess } from './lib/auth/gate';

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: list => {
          list.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  const path = request.nextUrl.pathname;
  const access = routeAccess(path);
  const { data: { user } } = await supabase.auth.getUser();
  let profile: { role: string; staff_level: string | null } | null = null;
  if (user) {
    const { data } = await supabase.from('profiles').select('role, staff_level').eq('id', user.id).single();
    profile = data ?? null;
  }

  const decision = gateDecision(access, profile);
  if (decision.allow) {
    if (path === '/' || (path === '/login' && profile?.role === 'staff')) {
      return redirectKeepingCookies(request, response, '/orders');
    }
    return response;
  }
  if (decision.signOut) await supabase.auth.signOut();
  const target = decision.message ? `${decision.redirect}?m=notstaff` : decision.redirect;
  return redirectKeepingCookies(request, response, target);
}

function redirectKeepingCookies(request: NextRequest, from: NextResponse, to: string) {
  const res = NextResponse.redirect(new URL(to, request.url));
  from.cookies.getAll().forEach(c => res.cookies.set(c));
  return res;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/).*)'],
};
