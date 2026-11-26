import { expect, test } from 'vitest';
import { isActive } from './nav';

test('같은 주소와 그 아래 화면은 켜지고, 이름만 비슷한 주소는 아니다', () => {
  expect(isActive('/admin/billing', '/admin/billing')).toBe(true);
  expect(isActive('/admin/billing/abc', '/admin/billing')).toBe(true);
  expect(isActive('/admin/billings', '/admin/billing')).toBe(false);
});

test('오더 접수 화면에서는 관제판이 꺼진다', () => {
  expect(isActive('/orders/123', '/orders', ['/orders/new'])).toBe(true);
  expect(isActive('/orders/new', '/orders', ['/orders/new'])).toBe(false);
  expect(isActive('/orders/new', '/orders/new')).toBe(true);
});
