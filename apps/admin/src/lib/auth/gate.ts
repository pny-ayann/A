export type Access = 'public' | 'staff' | 'settle' | 'admin';
export type GateProfile = { role: string; staff_level: string | null } | null;
export type GateResult =
  | { allow: true }
  | { allow: false; redirect: '/login' | '/orders'; signOut?: boolean; message?: string };

const STAFF_READABLE = ['/admin/drivers', '/admin/companies'];
/** 관리자와 '정산' 등급이 들어오는 화면 (서버도 can_settle로 한 번 더 막는다) */
const SETTLE = ['/admin/wallets', '/admin/withdrawals', '/admin/billing'];

const under = (path: string, list: string[]) => list.some(p => path === p || path.startsWith(`${p}/`));

/** 관리자 또는 정산 등급 */
export const canSettle = (level: string | null | undefined) => level === 'admin' || level === 'accounting';

/** 경로가 누구에게 열려 있는지 */
export function routeAccess(path: string): Access {
  if (path === '/login' || path.startsWith('/login/')) return 'public';
  // 기사·업체 목록은 일반 관제도 본다 (설계 8.5). 고치는 서버 액션은 관리자·정산만 허용한다
  if (under(path, STAFF_READABLE)) return 'staff';
  if (under(path, SETTLE)) return 'settle';
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
  if (access === 'settle' && !canSettle(profile.staff_level)) return { allow: false, redirect: '/orders' };
  return { allow: true };
}
