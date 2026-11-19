import type { UserRole } from '@takson/shared';

export type CustomerProfile = {
  id: string;
  role: UserRole;
  name: string | null;
  company_id: string | null;
};

export type Route = 'login' | 'home' | 'not-customer' | 'retry';

/**
 * 로그인한 사람의 프로필로 어느 화면에 둘지 정한다. 업체에 속한 고객 계정만 들어온다.
 * 프로필을 아예 못 불러왔으면(신호 약함·서버 오류) '고객 아님'이 아니라 다시 시도 화면.
 */
export function routeFor(p: CustomerProfile | null, hasSession: boolean, loadFailed = false): Route {
  if (!hasSession) return 'login';
  if (loadFailed) return 'retry';
  if (!p || p.role !== 'customer' || !p.company_id) return 'not-customer';
  return 'home';
}
