import { expect, test } from 'vitest';
import { routeFor } from './gate';

const cust = { id: 'u1', role: 'customer' as const, name: '고객', company_id: 'c1' };

test('로그인 안 했으면 로그인 화면', () => {
  expect(routeFor(null, false)).toBe('login');
  expect(routeFor(cust, false)).toBe('login');
});

test('업체가 있는 고객 계정이면 홈', () => {
  expect(routeFor(cust, true)).toBe('home');
});

test('기사·관제 계정은 고객 앱을 쓸 수 없다', () => {
  expect(routeFor({ ...cust, role: 'driver' }, true)).toBe('not-customer');
  expect(routeFor({ ...cust, role: 'staff' }, true)).toBe('not-customer');
});

test('업체가 없는 고객 계정도 쓸 수 없다', () => {
  expect(routeFor({ ...cust, company_id: null }, true)).toBe('not-customer');
});

test('프로필을 못 읽었으면 쓸 수 없다', () => {
  expect(routeFor(null, true)).toBe('not-customer');
});
