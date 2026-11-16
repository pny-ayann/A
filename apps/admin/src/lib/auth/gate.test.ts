import { gateDecision, routeAccess } from './gate';

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
