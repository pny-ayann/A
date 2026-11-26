import type { DispatchMode, OrderKind, OrderStatus, PaymentMethod } from '@takson/shared';

/** 관제판 한 줄에 필요한 오더 컬럼 */
export type OrderRow = {
  id: string;
  order_no: string;
  status: OrderStatus;
  kind: OrderKind;
  company_id: string;
  driver_id: string | null;
  reserved_at: string | null;
  pickup_area: string | null;
  dropoff_area: string | null;
  pickup_address: string;
  dropoff_address: string;
  vehicle_number: string | null;
  pickup_lat: number | null;
  pickup_lng: number | null;
  dropoff_lat: number | null;
  dropoff_lng: number | null;
  fare: number;
  payment_method: PaymentMethod;
  dispatch_mode: DispatchMode;
  created_at: string;
  updated_at: string;
};

export const ORDER_ROW_COLUMNS =
  'id, order_no, status, kind, company_id, driver_id, reserved_at, pickup_area, dropoff_area, pickup_address, dropoff_address, vehicle_number, pickup_lat, pickup_lng, dropoff_lat, dropoff_lng, fare, payment_method, dispatch_mode, created_at, updated_at';

export type OrderChange = {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  new: Partial<OrderRow>;
  old: Partial<OrderRow>;
};

const time = (s: string | undefined) => (s ? new Date(s).getTime() : 0);
const newestFirst = (a: OrderRow, b: OrderRow) => time(b.created_at) - time(a.created_at);

/** 실시간 변경 하나를 목록에 반영한다. 같은 id는 한 줄, 옛 UPDATE는 무시 */
export function applyChange(list: OrderRow[], change: OrderChange): OrderRow[] {
  if (change.eventType === 'DELETE') {
    const id = change.old.id;
    return id ? list.filter(o => o.id !== id) : list;
  }
  const next = change.new as OrderRow;
  if (!next.id) return list;
  const cur = list.find(o => o.id === next.id);
  if (cur && time(next.updated_at) < time(cur.updated_at)) return list;
  const merged = cur ? { ...cur, ...next } : next;
  return [merged, ...list.filter(o => o.id !== next.id)].sort(newestFirst);
}

export type OrderFilter = {
  status?: OrderStatus[];
  companyId?: string;
  driverId?: string;
  /** YYYY-MM-DD (한국 시간). 접수일이나 예약일이 이 날인 오더 */
  date?: string;
  reservedOnly?: boolean;
};

/** 한국 시간 기준 날짜 YYYY-MM-DD */
export function kstDate(iso: string): string {
  return new Date(new Date(iso).getTime() + 9 * 3600_000).toISOString().slice(0, 10);
}

export function filterOrders(list: OrderRow[], f: OrderFilter): OrderRow[] {
  return list.filter(o =>
    (!f.status?.length || f.status.includes(o.status))
    && (!f.companyId || o.company_id === f.companyId)
    && (!f.driverId || o.driver_id === f.driverId)
    && (!f.reservedOnly || o.reserved_at !== null)
    && (!f.date || kstDate(o.reserved_at ?? o.created_at) === f.date));
}

/** 관제판에 보이는 끝난 오더의 기간: 최근 7일 */
export function boardSince(now: Date): string {
  return new Date(now.getTime() - 7 * 24 * 3600_000).toISOString();
}
