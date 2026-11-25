import { kstShort, won } from '../time';

/** RPC list_open_orders 한 줄 (연락처·전체 주소는 서버가 안 줌) */
export type OpenOrder = {
  id: string;
  order_no: string;
  kind: 'takson' | 'daeri';
  reserved_at: string | null;
  pickup_area: string | null;
  dropoff_area: string | null;
  fare: number;
  payment_method: 'cash' | 'postpaid';
  distance_km: number | null;
  mission_names: string[];
};

/** 서버(list_open_orders)와 같은 순서: 일반 오더 가까운 순(거리 모름은 뒤) → 예약 오더 예약 시간 순 */
export function sortOpenOrders(rows: OpenOrder[]): OpenOrder[] {
  const key = (r: OpenOrder) => (r.distance_km ?? Number.POSITIVE_INFINITY);
  const normal = rows.filter(r => !r.reserved_at).sort((a, b) => key(a) - key(b));
  const reserved = rows.filter(r => r.reserved_at)
    .sort((a, b) => new Date(a.reserved_at!).getTime() - new Date(b.reserved_at!).getTime());
  return [...normal, ...reserved];
}

const squash = (s: string | null) => (s ?? '').replace(/\s+/g, '');

/** 출발지·도착지 동네 이름에 검색 글자가 들어 있는 오더만 (띄어쓰기 무시) */
export function searchOrders(rows: OpenOrder[], from: string, to: string): OpenOrder[] {
  const f = squash(from), t = squash(to);
  return rows.filter(r => squash(r.pickup_area).includes(f) && squash(r.dropoff_area).includes(t));
}

/** 금액 큰 순 */
export const sortByFare = (rows: OpenOrder[]) => [...rows].sort((a, b) => b.fare - a.fare);

export function cardView(o: OpenOrder) {
  return {
    title: `${o.pickup_area || '출발지'} → ${o.dropoff_area || '도착지'}`,
    badge: o.reserved_at ? `[예약] ${kstShort(o.reserved_at)}` : null,
    distance: o.distance_km === null ? '거리 모름' : `${o.distance_km.toFixed(1)}km`,
    fare: won(o.fare),
    pay: o.payment_method === 'cash' ? '현금' as const : '후불' as const,
    kindLabel: o.kind === 'daeri' ? '대리' as const : '탁송' as const,
  };
}
