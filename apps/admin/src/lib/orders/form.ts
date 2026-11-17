import type { OrderKind, PaymentMethod, Transmission } from '@takson/shared';

export type Place = {
  address: string;
  detail: string;
  area: string | null;
  lat: number | null;
  lng: number | null;
  contactName: string;
  contactPhone: string;
};

export type OrderForm = {
  companyId: string;
  kind: OrderKind;
  pickup: Place;
  dropoff: Place;
  waypoints: Place[];
  vehicleNumber: string;
  vehicleModel: string;
  vehicleColor: string;
  transmission: Transmission | '';
  driverMemo: string;
  missionIds: string[];
  reservedAt: string | null;
  paymentMethod: PaymentMethod;
  fare: number | null;
  distanceKm: number | null;
  staffOnly: boolean;
};

export const emptyPlace = (): Place => ({
  address: '', detail: '', area: null, lat: null, lng: null, contactName: '', contactPhone: '',
});

/** 접수 폼 검사. 문제가 없으면 null */
export function validateOrderForm(f: OrderForm, now: Date): string | null {
  if (!f.companyId) return '업체를 골라 주세요.';
  if (!f.pickup.address.trim()) return '출발지를 입력해 주세요.';
  if (!f.dropoff.address.trim()) return '도착지를 입력해 주세요.';
  if (f.waypoints.some(w => !w.address.trim())) return '경유지 주소를 입력하거나 경유지를 지워 주세요.';
  if (!f.vehicleNumber.trim()) return '차량번호를 입력해 주세요.';
  if (f.fare === null) return '요금을 입력해 주세요.';
  if (!Number.isInteger(f.fare) || f.fare < 0) return '요금은 0원 이상 정수로 넣어 주세요.';
  if (f.reservedAt) {
    const t = new Date(f.reservedAt).getTime();
    if (Number.isNaN(t)) return '예약 시간을 다시 골라 주세요.';
    if (t <= now.getTime()) return '예약 시간이 지났어요.';
  }
  return null;
}

const orNull = (s: string) => (s.trim() === '' ? null : s.trim());

function placeColumns(prefix: 'pickup' | 'dropoff', p: Place) {
  return {
    [`${prefix}_address`]: p.address.trim(),
    [`${prefix}_detail`]: orNull(p.detail),
    [`${prefix}_area`]: p.area,
    [`${prefix}_lat`]: p.lat,
    [`${prefix}_lng`]: p.lng,
    [`${prefix}_contact_name`]: orNull(p.contactName),
    [`${prefix}_contact_phone`]: orNull(p.contactPhone),
  };
}

/** orders 테이블에 넣을 행. 상태·기사는 서버 기본값에 맡긴다. */
export function toOrderInsert(f: OrderForm): Record<string, unknown> {
  return {
    company_id: f.companyId,
    kind: f.kind,
    dispatch_mode: f.staffOnly ? 'staff_only' : 'open',
    reserved_at: f.reservedAt,
    ...placeColumns('pickup', f.pickup),
    ...placeColumns('dropoff', f.dropoff),
    vehicle_number: orNull(f.vehicleNumber),
    vehicle_model: orNull(f.vehicleModel),
    vehicle_color: orNull(f.vehicleColor),
    transmission: f.transmission || null,
    driver_memo: orNull(f.driverMemo),
    payment_method: f.paymentMethod,
    fare: f.fare,
    distance_km: f.distanceKm,
  };
}

/** order_waypoints 테이블에 넣을 행들 */
export function toWaypointRows(orderId: string, waypoints: Place[]) {
  return waypoints.map((w, i) => ({
    order_id: orderId, seq: i + 1, address: w.address.trim(), detail: orNull(w.detail), area: w.area,
    lat: w.lat, lng: w.lng, contact_name: orNull(w.contactName), contact_phone: orNull(w.contactPhone),
  }));
}
