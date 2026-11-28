import { expect, test } from 'vitest';
import type { OrderStatus } from '@takson/shared';
import { applyChange, boardSince, filterOrders, type OrderRow } from './realtime';

function row(id: string, hhmm: string, status: OrderStatus = 'open', extra: Partial<OrderRow> = {}): OrderRow {
  return {
    id, order_no: `1117-${id}`, status, kind: 'takson', company_id: 'c1', driver_id: null, reserved_at: null,
    pickup_area: '중구', dropoff_area: '강남구', pickup_address: '서울 중구 세종대로 110', dropoff_address: '서울 강남구 강남대로 396', vehicle_number: '12가3456', pickup_lat: null, pickup_lng: null, dropoff_lat: null, dropoff_lng: null,
    fare: 20000, payment_method: 'postpaid', dispatch_mode: 'open',
    created_at: `2026-11-17T${hhmm}:00Z`, updated_at: `2026-11-17T${hhmm}:00Z`,
    ...extra,
  };
}

test('같은 INSERT가 두 번 와도 한 줄', () => {
  const l1 = applyChange([], { eventType: 'INSERT', new: row('a', '10:00'), old: {} });
  expect(applyChange(l1, { eventType: 'INSERT', new: row('a', '10:00'), old: {} })).toHaveLength(1);
});

test('새 UPDATE는 반영', () => {
  const l = [row('a', '10:00')];
  expect(applyChange(l, { eventType: 'UPDATE', new: row('a', '10:03', 'assigned'), old: { id: 'a' } })[0]!.status).toBe('assigned');
});

test('늦게 도착한 옛 UPDATE는 무시', () => {
  const l = [row('a', '10:05', 'driving')];
  expect(applyChange(l, { eventType: 'UPDATE', new: row('a', '10:01', 'assigned'), old: { id: 'a' } })[0]!.status).toBe('driving');
});

test('목록에 없던 오더의 UPDATE는 추가', () => {
  expect(applyChange([], { eventType: 'UPDATE', new: row('b', '10:00'), old: { id: 'b' } })).toHaveLength(1);
});

test('DELETE는 제거', () => {
  const l = [row('a', '10:00'), row('b', '10:00')];
  expect(applyChange(l, { eventType: 'DELETE', new: {}, old: { id: 'a' } }).map(o => o.id)).toEqual(['b']);
});

test('새 오더가 맨 위', () => {
  const l = [row('a', '10:00')];
  expect(applyChange(l, { eventType: 'INSERT', new: row('b', '10:10'), old: {} })[0]!.id).toBe('b');
});

test('필터: 상태·업체·기사·날짜·예약만', () => {
  const l = [
    row('a', '10:00', 'open'),
    row('b', '11:00', 'assigned', { driver_id: 'd1', company_id: 'c2' }),
    row('c', '12:00', 'open', { reserved_at: '2026-11-18T01:00:00Z' }),
  ];
  expect(filterOrders(l, { status: ['open'] }).map(o => o.id)).toEqual(['a', 'c']);
  expect(filterOrders(l, { companyId: 'c2' }).map(o => o.id)).toEqual(['b']);
  expect(filterOrders(l, { driverId: 'd1' }).map(o => o.id)).toEqual(['b']);
  expect(filterOrders(l, { reservedOnly: true }).map(o => o.id)).toEqual(['c']);
  // 날짜는 한국 시간 기준: 접수일 또는 예약일
  expect(filterOrders(l, { date: '2026-11-18' }).map(o => o.id)).toEqual(['c']);
  expect(filterOrders(l, { date: '2026-11-17' }).map(o => o.id)).toEqual(['a', 'b']);
});

test('끝난 오더는 최근 7일만', () => {
  expect(boardSince(new Date('2026-11-17T00:00:00Z'))).toBe('2026-11-10T00:00:00.000Z');
});

test('검색: 번호·주소·동네·차량번호(띄어쓰기 무시)·업체·기사 이름, 여러 낱말은 모두 맞아야', () => {
  const l = [
    row('a', '09:00', 'open', { order_no: '1128-001', pickup_address: '서울 중구 세종대로 110', dropoff_area: '강남구 역삼동', vehicle_number: '12가 3456', company_id: 'c1' }),
    row('b', '09:10', 'driving', { order_no: '1128-002', pickup_address: '수원시 권선구', dropoff_area: '마포구 합정동', vehicle_number: '34나5678', company_id: 'c2', driver_id: 'd1' }),
  ];
  const names = (o: OrderRow) => `${o.company_id === 'c1' ? '개발상사' : '한빛캐피탈'} ${o.driver_id ? '김기사' : ''}`;
  const ids = (q: string) => filterOrders(l, { q, nameOf: names }).map(o => o.id);
  expect(ids('1128-002')).toEqual(['b']);
  expect(ids('세종대로')).toEqual(['a']);
  expect(ids('역삼')).toEqual(['a']);
  expect(ids('12가3456')).toEqual(['a']);
  expect(ids('34나 5678')).toEqual(['b']);
  expect(ids('한빛')).toEqual(['b']);
  expect(ids('김기사')).toEqual(['b']);
  expect(ids('수원 합정')).toEqual(['b']);
  expect(ids('수원 역삼')).toEqual([]);
  expect(ids('  ')).toEqual(['a', 'b']);
});

test('결제 방식: 고른 것만 (아무것도 안 고르면 전부)', () => {
  const l = [row('a', '09:00', 'open', { payment_method: 'cash' }), row('b', '09:10', 'open', { payment_method: 'postpaid' })];
  const ids = (payments: ('cash' | 'postpaid')[]) => filterOrders(l, { payments }).map(o => o.id);
  expect(ids(['cash'])).toEqual(['a']);
  expect(ids(['postpaid'])).toEqual(['b']);
  expect(ids(['cash', 'postpaid'])).toEqual(['a', 'b']);
  expect(ids([])).toEqual(['a', 'b']);
});
