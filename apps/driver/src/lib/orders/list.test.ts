import { expect, test } from 'vitest';
import { cardView, sortOpenOrders, type OpenOrder } from './list';

const o = (p: Partial<OpenOrder>): OpenOrder => ({
  id: 'X', kind: 'takson', reserved_at: null, pickup_area: '강남구 역삼동', dropoff_area: '수원시 영통구',
  fare: 35000, payment_method: 'postpaid', distance_km: null, mission_names: [], ...p,
});

test('일반 오더는 가까운 순, 거리 모르는 건 뒤, 예약은 그 뒤에 예약 시간 순 (서버 순서와 같음)', () => {
  const rows = [
    o({ id: 'r2', reserved_at: '2026-11-18T07:00:00Z', distance_km: 1 }),
    o({ id: 'far', distance_km: 9 }),
    o({ id: 'none', distance_km: null }),
    o({ id: 'r1', reserved_at: '2026-11-18T05:00:00Z', distance_km: 20 }),
    o({ id: 'near', distance_km: 2 }),
  ];
  expect(sortOpenOrders(rows).map(r => r.id)).toEqual(['near', 'far', 'none', 'r1', 'r2']);
});

test('카드 표시', () => {
  const v = cardView(o({ reserved_at: '2026-11-18T05:00:00Z', distance_km: 3.24, payment_method: 'cash', kind: 'daeri' }));
  expect(v).toEqual({
    title: '강남구 역삼동 → 수원시 영통구', badge: '[예약] 11/18 14:00', distance: '3.2km', fare: '35,000원',
    pay: '현금', kindLabel: '대리',
  });
  const plain = cardView(o({}));
  expect(plain.badge).toBeNull();
  expect(plain.distance).toBe('거리 모름');
  expect(plain.pay).toBe('후불');
});

test('동네 이름이 없으면 대신 표시', () => {
  expect(cardView(o({ pickup_area: null, dropoff_area: null })).title).toBe('출발지 → 도착지');
});
