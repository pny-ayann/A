export type Access = 'public' | 'staff' | 'admin';
export type GateProfile = { role: string; staff_level: string | null } | null;
export type GateResult =
  | { allow: true }
  | { allow: false; redirect: '/login' | '/orders'; signOut?: boolean; message?: string };

/** 경로가 누구에게 열려 있는지 */
export function routeAccess(path: string): Access {
  if (path === '/login' || path.startsWith('/login/')) return 'public';
  if (path === '/admin' || path.startsWith('/admin/')) return 'admin';
  return 'staff';
}

/** 로그인한 사람의 프로필로 들어올 수 있는지 판정 */
export function gateDecision(access: Access, profile: GateProfile): GateResult {
  if (access === 'public') return { allow: true };
  if (!profile) return { allow: false, redirect: '/login' };
  if (profile.role !== 'staff') {
    return { allow: false, redirect: '/login', signOut: true, message: '직원 계정이 아니에요.' };
  }
  if (access === 'admin' && profile.staff_level !== 'admin') return { allow: false, redirect: '/orders' };
  return { allow: true };
}
