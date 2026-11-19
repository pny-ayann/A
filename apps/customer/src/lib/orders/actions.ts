import type { AmendReason, OrderStatus, Place } from '@takson/shared';

/** 고객이 이 상태에서 할 수 있는 일 (설계 5장·7.2: 배차 전 취소·수정, 배차 후엔 정해진 변경만) */
export function actionsFor(status: OrderStatus): { cancel: boolean; edit: boolean; amend: boolean } {
  if (status === 'open') return { cancel: true, edit: true, amend: false };
  if (status === 'assigned' || status === 'arrived_pickup' || status === 'driving') return { cancel: false, edit: false, amend: true };
  return { cancel: false, edit: false, amend: false };
}

export type AmendInput = {
  reason: AmendReason | null;
  fare: number | null;
  /** 도착지 변경이면 새 도착지, 경유지 추가면 추가할 경유지 */
  place?: Place;
  missionId?: string;
};

export type AmendPayload = {
  p_reason: AmendReason;
  p_fare: number;
  p_dropoff?: Record<string, unknown>;
  p_waypoint?: Record<string, unknown>;
  p_mission_id?: string;
};

const orNull = (s: string) => (s.trim() === '' ? null : s.trim());
const placeJson = (p: Place) => ({
  address: p.address.trim(), detail: orNull(p.detail), area: p.area, lat: p.lat, lng: p.lng,
  contact_name: orNull(p.contactName), contact_phone: orNull(p.contactPhone),
});

/** customer_amend_order 에 보낼 값. 빠진 게 있으면 안내 문구 */
export function amendPayload(i: AmendInput): AmendPayload | string {
  if (!i.reason) return '바꾸는 이유를 골라 주세요.';
  if (i.fare === null) return '새 요금을 넣어 주세요.';
  if (!Number.isInteger(i.fare) || i.fare < 0) return '요금은 0원 이상 정수로 넣어 주세요.';
  const base = { p_reason: i.reason, p_fare: i.fare };
  if (i.reason === 'dropoff_change') {
    if (!i.place?.address.trim()) return '새 도착지를 골라 주세요.';
    return { ...base, p_dropoff: placeJson(i.place) };
  }
  if (i.reason === 'waypoint_added') {
    if (!i.place?.address.trim()) return '추가할 경유지를 골라 주세요.';
    return { ...base, p_waypoint: placeJson(i.place) };
  }
  if (!i.missionId) return '추가할 미션을 골라 주세요.';
  return { ...base, p_mission_id: i.missionId };
}
