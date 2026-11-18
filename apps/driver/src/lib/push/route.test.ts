import { expect, test } from 'vitest';
import { routeForNotification } from './route';

test('알림 종류에 맞는 화면 주소', () => {
  expect(routeForNotification({ screen: 'chat', orderId: 'O1' })).toBe('/order/O1/chat');
  expect(routeForNotification({ screen: 'order', orderId: 'O1' })).toBe('/order/O1');
  expect(routeForNotification({ screen: 'list', orderId: 'O1' })).toBe('/');
  expect(routeForNotification({ screen: 'list' })).toBe('/');
});

test('모양이 이상하면 null', () => {
  expect(routeForNotification(null)).toBeNull();
  expect(routeForNotification('chat')).toBeNull();
  expect(routeForNotification({ screen: 'chat' })).toBeNull();
  expect(routeForNotification({ screen: 'order', orderId: 5 })).toBeNull();
  expect(routeForNotification({ screen: 'order', orderId: '../x' })).toBeNull();
  expect(routeForNotification({ screen: 'settings', orderId: 'O1' })).toBeNull();
});
