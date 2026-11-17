export type DriverProfile = {
  id: string;
  role: string;
  name: string | null;
  driver_status: 'pending' | 'active' | 'suspended' | null;
};

export type Route = 'login' | 'pending' | 'suspended' | 'home' | 'not-driver';

/** 로그인한 사람의 프로필로 어느 화면에 둘지 정한다 */
export function routeFor(p: DriverProfile | null): Route {
  if (!p) return 'login';
  if (p.role !== 'driver') return 'not-driver';
  if (p.driver_status === 'active') return 'home';
  if (p.driver_status === 'suspended') return 'suspended';
  return 'pending';
}
