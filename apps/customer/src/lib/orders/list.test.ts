import { expect, test } from 'vitest';
import { sortOrders, splitTabs, type ListOrder } from './list';

const o = (id: string, status: ListOrder['status'], created: string, reserved: string | null = null): ListOrder =>
  ({ id, status, created_at: created, reserved_at: reserved });

const rows: ListOrder[] = [
  o('done-old', 'completed', '2026-11-10T00:00:00Z'),
  o('open-now', 'open', '2026-11-18T09:00:00Z'),
  o('driving', 'driving', '2026-11-18T01:00:00Z'),
  o('open-res-late', 'open', '2026-11-18T08:00:00Z', '2026-11-20T05:00:00Z'),
  o('cancel-new', 'cancelled', '2026-11-18T10:00:00Z'),
  o('assigned', 'assigned', '2026-11-18T07:00:00Z'),
  o('open-res-soon', 'open', '2026-11-18T10:30:00Z', '2026-11-19T05:00:00Z'),
  o('done-new', 'completed', '2026-11-18T06:00:00Z'),
];

test('진행 중 먼저, 다음 접수 대기(바로 → 예약 시각순), 끝난 것은 최근순', () => {
  expect(sortOrders(rows).map(r => r.id)).toEqual([
    'assigned', 'driving', 'open-now', 'open-res-soon', 'open-res-late', 'cancel-new', 'done-new', 'done-old',
  ]);
});

test('끝난 오더(완료·취소)는 따로 보여 준다', () => {
  const t = splitTabs(rows);
  expect(t.active.map(r => r.id)).toEqual(['assigned', 'driving', 'open-now', 'open-res-soon', 'open-res-late']);
  expect(t.done.map(r => r.id)).toEqual(['cancel-new', 'done-new', 'done-old']);
});
