import { canSettle, gateDecision, routeAccess } from './gate';

test('로그인 안 했으면 /login', () => {
  expect(gateDecision('staff', null)).toEqual({ allow: false, redirect: '/login' });
});
test('고객 계정은 로그아웃시키고 /login', () => {
  expect(gateDecision('staff', { role: 'customer', staff_level: null }))
    .toEqual({ allow: false, redirect: '/login', signOut: true, message: '직원 계정이 아니에요.' });
});
test('기사 계정도 로그아웃시키고 /login', () => {
  expect(gateDecision('admin', { role: 'driver', staff_level: null }))
    .toEqual({ allow: false, redirect: '/login', signOut: true, message: '직원 계정이 아니에요.' });
});
test('일반 관제가 관리자 화면에 오면 /orders', () => {
  expect(gateDecision('admin', { role: 'staff', staff_level: 'operator' })).toEqual({ allow: false, redirect: '/orders' });
});
test('관리자는 관리자 화면 허용', () => {
  expect(gateDecision('admin', { role: 'staff', staff_level: 'admin' })).toEqual({ allow: true });
});
test('일반 관제는 직원 화면 허용', () => {
  expect(gateDecision('staff', { role: 'staff', staff_level: 'operator' })).toEqual({ allow: true });
});
test('로그인 화면은 누구나', () => {
  expect(gateDecision('public', null)).toEqual({ allow: true });
});
test('경로 분류', () => {
  expect(routeAccess('/login')).toBe('public');
  expect(routeAccess('/admin/fares')).toBe('admin');
  expect(routeAccess('/admin')).toBe('admin');
  expect(routeAccess('/administrator')).toBe('staff');
  expect(routeAccess('/orders/abc')).toBe('staff');
  expect(routeAccess('/')).toBe('staff');
});

test('일반 관제도 기사·업체 목록은 볼 수 있다 (설계 8.5: 기사와 업체 조회), 수정은 서버 액션이 관리자만 허용', () => {
  expect(routeAccess('/admin/drivers')).toBe('staff');
  expect(routeAccess('/admin/companies')).toBe('staff');
  expect(routeAccess('/admin/staff')).toBe('admin');
  expect(routeAccess('/admin/audit')).toBe('admin');
});

test('정산 화면(충전금·출금·업체 정산)은 관리자와 정산 등급만', () => {
  expect(routeAccess('/admin/wallets')).toBe('settle');
  expect(routeAccess('/admin/wallets/abc')).toBe('settle');
  expect(routeAccess('/admin/withdrawals')).toBe('settle');
  expect(routeAccess('/admin/billing/x')).toBe('settle');
  expect(gateDecision('settle', { role: 'staff', staff_level: 'accounting' })).toEqual({ allow: true });
  expect(gateDecision('settle', { role: 'staff', staff_level: 'admin' })).toEqual({ allow: true });
  expect(gateDecision('settle', { role: 'staff', staff_level: 'operator' })).toEqual({ allow: false, redirect: '/orders' });
});
test('정산 등급도 직원 계정·운영 설정 같은 관리자 화면은 못 들어온다', () => {
  expect(gateDecision('admin', { role: 'staff', staff_level: 'accounting' })).toEqual({ allow: false, redirect: '/orders' });
  expect(canSettle('accounting')).toBe(true);
  expect(canSettle('admin')).toBe(true);
  expect(canSettle('operator')).toBe(false);
  expect(canSettle(null)).toBe(false);
});
