import type { UserRole } from '@takson/shared';

export type CustomerProfile = {
  id: string;
  role: UserRole;
  name: string | null;
  company_id: string | null;
};

export type Route = 'login' | 'home' | 'not-customer';

/** 로그인한 사람의 프로필로 어느 화면에 둘지 정한다. 업체에 속한 고객 계정만 들어온다 */
export function routeFor(p: CustomerProfile | null, hasSession: boolean): Route {
  if (!hasSession) return 'login';
  if (!p || p.role !== 'customer' || !p.company_id) return 'not-customer';
  return 'home';
}
