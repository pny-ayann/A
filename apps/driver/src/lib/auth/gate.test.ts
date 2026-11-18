import { expect, test } from 'vitest';
import { routeFor, type DriverProfile } from './gate';

const base: DriverProfile = { id: 'D1', role: 'driver', name: '김기사', driver_status: 'active' };

test('로그인 안 했으면 로그인 화면', () => {
  expect(routeFor(null)).toBe('login');
});

test('기사가 아닌 계정은 막는다', () => {
  expect(routeFor({ ...base, role: 'customer', driver_status: null })).toBe('not-driver');
  expect(routeFor({ ...base, role: 'staff', driver_status: null })).toBe('not-driver');
});

test('승인 대기, 정지, 승인 기사', () => {
  expect(routeFor({ ...base, driver_status: 'pending' })).toBe('pending');
  expect(routeFor({ ...base, driver_status: 'suspended' })).toBe('suspended');
  expect(routeFor(base)).toBe('home');
});
