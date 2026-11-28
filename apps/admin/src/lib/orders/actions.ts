import { REQUIRED_SLOTS, type OrderKind, type OrderStatus, type PaymentMethod, type PhotoSlot, type Transmission } from '@takson/shared';
import { toOrderInsert, toWaypointRows, validateOrderForm, type OrderForm, type Place } from './form';
import { STATUS_LABEL } from './labels';

/** 필수 사진 칸 (서버 missing_photos와 같은 순서) */
export const PHOTO_SLOTS = REQUIRED_SLOTS;
export const SLOT_LABEL: Record<PhotoSlot, string> = { front: '앞', back: '뒤', left: '왼쪽', right: '오른쪽', dashboard: '계기판', key: '차키' };

export type MissingPhotos = { pickup: string[]; dropoff: string[] };

/** 상태를 바꿀 때 사유가 꼭 필요한지 (최종 판단은 서버 staff_set_status) */
export function needsReason(_from: OrderStatus, to: OrderStatus, missing: MissingPhotos): boolean {
  if (to === 'cancelled') return true;
  if ((to === 'driving' || to === 'completed') && missing.pickup.length > 0) return true;
  if (to === 'completed' && missing.dropoff.length > 0) return true;
  return false;
}

const AMEND_LABEL: Record<string, string> = {
  dropoff_change: '도착지 변경', waypoint_added: '경유지 추가', mission_added: '미션 추가',
};

const FIELD_LABEL: Record<string, string> = {
  kind: '종류', dispatch_mode: '배차 방식', reserved_at: '예약 시간',
  pickup_address: '출발지 주소', pickup_detail: '출발지 상세', pickup_area: '출발지 지역',
  pickup_lat: '출발지 좌표', pickup_lng: '출발지 좌표',
  pickup_contact_name: '출발지 담당자', pickup_contact_phone: '출발지 연락처',
  dropoff_address: '도착지 주소', dropoff_detail: '도착지 상세', dropoff_area: '도착지 지역',
  dropoff_lat: '도착지 좌표', dropoff_lng: '도착지 좌표',
  dropoff_contact_name: '도착지 담당자', dropoff_contact_phone: '도착지 연락처',
  vehicle_number: '차량번호', vehicle_model: '차종', vehicle_color: '색상', transmission: '변속기',
  driver_memo: '기사 메모', payment_method: '결제 방식', distance_km: '거리',
  capital_company_id: '캐피탈 회사', waypoints: '경유지', missions: '미션', seal_count: '인감 수',
};

const won = (n: unknown) => `${Number(n).toLocaleString('ko-KR')}원`;
const statusName = (s: string | null | undefined) => (s && s in STATUS_LABEL ? STATUS_LABEL[s as OrderStatus] : s ?? '?');
const withReason = (text: string, reason: string | null | undefined) => (reason ? `${text} – ${reason}` : text);

export type EventLike = { type: string; from_status?: string | null; to_status?: string | null; reason?: string | null; data?: unknown };

/** 이력 한 줄을 한국어로 */
export function describeEvent(e: EventLike): string {
  const data = (e.data ?? {}) as Record<string, unknown>;
  switch (e.type) {
    case 'status':
      return withReason(`${statusName(e.from_status)} → ${statusName(e.to_status)}`, e.reason);
    case 'fare': {
      const base = `요금 ${won(data.from)} → ${won(data.to)}`;
      if (!e.reason) return base;
      return `${base} (${AMEND_LABEL[e.reason] ?? e.reason})`;
    }
    case 'photo_override': {
      const missing = (data.missing ?? {}) as Partial<MissingPhotos>;
      const parts: string[] = [];
      if (missing.pickup?.length) parts.push(`출발 사진 ${missing.pickup.length}장`);
      if (missing.dropoff?.length) parts.push(`도착 사진 ${missing.dropoff.length}장`);
      return withReason(`사진 없이 진행: ${parts.join(', ')} 없음`, e.reason);
    }
    case 'doc_review':
      return data.ok ? `서류 인정: ${String(data.label)}` : `서류 불인정: ${String(data.label)} — ${e.reason ?? ''}`;
    case 'photo_reject':
      return `사진 불인정: ${data.phase === 'dropoff' ? '도착' : '출발'} ${SLOT_LABEL[data.slot as PhotoSlot] ?? String(data.slot)} — ${e.reason ?? ''}`;
    case 'released':
      return withReason('기사 반납', e.reason);
    case 'unassigned':
      return withReason('관제 회수', e.reason);
    case 'reassigned':
      return '다른 기사로 다시 배차';
    case 'edit': {
      const keys = Array.isArray(e.data) ? (e.data as string[]) : [];
      const names = [...new Set(keys.map(k => FIELD_LABEL[k] ?? k))];
      return withReason(`수정: ${names.join(', ')}`, e.reason && AMEND_LABEL[e.reason] ? AMEND_LABEL[e.reason] : e.reason);
    }
    default:
      return e.type;
  }
}

/** 강제 배차 경고 코드를 한국어로 */
export const CONFLICT_LABEL: Record<string, string> = {
  HAS_ACTIVE_ORDER: '진행 중인 일반 오더 있음',
  RESERVATION_CONFLICT: '다른 예약과 시간이 가까움',
};

type Row = Record<string, unknown>;
const str = (v: unknown) => (v == null ? '' : String(v));
const num = (v: unknown) => (v == null ? null : Number(v));

function rowPlace(r: Row, p: 'pickup' | 'dropoff'): Place {
  return {
    address: str(r[`${p}_address`]), detail: str(r[`${p}_detail`]),
    area: (r[`${p}_area`] as string | null) ?? null, lat: num(r[`${p}_lat`]), lng: num(r[`${p}_lng`]),
    contactName: str(r[`${p}_contact_name`]), contactPhone: str(r[`${p}_contact_phone`]),
  };
}

/** 저장된 오더 행(+경유지·미션)을 수정 폼으로 */
export function rowToForm(r: Row, waypoints: Place[] = [], missionIds: string[] = []): OrderForm {
  return {
    companyId: str(r.company_id), kind: r.kind as OrderKind,
    pickup: rowPlace(r, 'pickup'), dropoff: rowPlace(r, 'dropoff'), waypoints,
    vehicleNumber: str(r.vehicle_number), vehicleModel: str(r.vehicle_model), vehicleColor: str(r.vehicle_color),
    transmission: (r.transmission as Transmission | null) ?? '', driverMemo: str(r.driver_memo), missionIds,
    reservedAt: (r.reserved_at as string | null) ?? null, paymentMethod: r.payment_method as PaymentMethod,
    fare: num(r.fare), distanceKm: num(r.distance_km), staffOnly: r.dispatch_mode === 'staff_only',
    capitalCompanyId: (r.capital_company_id as string | null) ?? null,
  };
}

/** 관제 수정 폼 검사. 기록을 바로잡을 수 있게 지난 예약 시간도 허용한다 */
export function validateOrderEdit(f: OrderForm): string | null {
  return validateOrderForm(f, new Date(0));
}

/** 수정 폼: 오더 폼 + 서류탁송 인감 수 */
export type EditForm = OrderForm & { sealCount?: number | null };

/** 수정 저장 때 보낼 칸: 처음 불러온 값과 달라진 orders 컬럼만 */
export function changedColumns(before: EditForm, after: EditForm): Record<string, unknown> {
  const a = { ...toOrderInsert(before), seal_count: before.sealCount ?? null };
  const b = { ...toOrderInsert(after), seal_count: after.sealCount ?? null };
  return Object.fromEntries(Object.entries(b).filter(([k, v]) => JSON.stringify(v) !== JSON.stringify(a[k as keyof typeof a])));
}

/** 경유지·미션: 바뀐 것만 (안 바뀌면 null → 서버가 그대로 둔다) */
export function changedExtras(before: OrderForm, after: OrderForm) {
  const rows = (f: OrderForm) => toWaypointRows('', f.waypoints);
  const ids = (f: OrderForm) => [...new Set(f.missionIds)].sort();
  return {
    waypoints: JSON.stringify(rows(before)) === JSON.stringify(rows(after)) ? null : rows(after),
    missionIds: JSON.stringify(ids(before)) === JSON.stringify(ids(after)) ? null : after.missionIds,
  };
}
