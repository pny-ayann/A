import { expect, test } from 'vitest';
import { totalUnread, unreadByOrder, unreadFor, type UnreadRow } from './unread';

const rows: UnreadRow[] = [
  { order_id: 'a', thread: 'customer', unread: 2 },
  { order_id: 'a', thread: 'driver', unread: 1 },
  { order_id: 'b', thread: 'customer', unread: 4 },
];

test('전체 안 읽은 수', () => {
  expect(totalUnread(rows.slice(0, 2))).toBe(3);
  expect(totalUnread([])).toBe(0);
});
test('오더·스레드별 안 읽은 수, 없으면 0', () => {
  expect(unreadFor(rows, 'a', 'driver')).toBe(1);
  expect(unreadFor(rows, 'b', 'driver')).toBe(0);
  expect(unreadFor(rows, 'z', 'customer')).toBe(0);
});
test('오더별 합계 (관제판 점 표시용)', () => {
  const m = unreadByOrder(rows);
  expect(m.get('a')).toBe(3);
  expect(m.get('b')).toBe(4);
  expect(m.has('z')).toBe(false);
});

import { readMark } from './unread';

test('읽음 시각은 마지막 메시지의 서버 시각 (내 컴퓨터 시계는 안 씀: 빠르면 새 문의를 놓침)', () => {
  expect(readMark(['2026-11-17T00:00:00Z', '2026-11-17T01:00:05.123Z'])).toBe('2026-11-17T01:00:05.123Z');
  expect(readMark([])).toBeNull();
});

test('서버 시각은 마이크로초까지 그대로 넘긴다 (잘라 내면 마지막 메시지가 안 읽음으로 남음)', () => {
  expect(readMark(['2026-11-17T00:00:00Z', '2026-11-17T01:00:05.123456+00:00'])).toBe('2026-11-17T01:00:05.123456+00:00');
});
