import { calcFare, type FareBand } from '@takson/shared';

export type FareInput = {
  /** 출발 → 경유 → 도착 거리. 아직 모르면 null */
  km: number | null;
  /** 길찾기를 했는데 실패함 */
  routeFailed: boolean;
  bands: FareBand[];
  missionExtras: number[];
  /** 고객이 직접 고친 요금 (배차 전엔 자유, 설계 7.2) */
  edited: number | null;
};

/** 접수 화면의 요금: 자동 계산 값, 실제로 낼 값, 안내 문구 */
export function fareState(s: FareInput): { fare: number | null; auto: number | null; note: string | null } {
  if (s.routeFailed) return { fare: s.edited, auto: null, note: '거리를 못 구했어요. 요금을 직접 넣어 주세요.' };
  if (s.km === null) return { fare: s.edited, auto: null, note: null };
  if (s.bands.length === 0) return { fare: s.edited, auto: null, note: '요금표가 없어요. 요금을 직접 넣어 주세요.' };
  const auto = calcFare(s.km, s.bands, s.missionExtras);
  return { fare: s.edited ?? auto, auto, note: null };
}

/**
 * 배차 후 변경 요청의 요금 기본값 (고객이 고칠 수 있음).
 * 협의·수정된 지금 요금을 덮어쓰지 않도록, 지금 요금에 '바뀐 만큼'만 더하거나 뺀다.
 * - 미션 추가: 지금 요금 + 미션 추가요금
 * - 경로 변경: 지금 요금 + (새 자동 요금 − 예전 자동 요금). 예전 값을 모르면 지금 요금 아래로 내리지 않는다.
 */
export function amendDefaultFare(a: {
  current: number;
  reason: 'dropoff_change' | 'waypoint_added' | 'mission_added';
  missionExtra: number | null;
  oldAuto: number | null;
  newAuto: number | null;
}): number | null {
  if (a.reason === 'mission_added') return a.missionExtra === null ? null : a.current + a.missionExtra;
  if (a.newAuto === null) return null;
  if (a.oldAuto === null) return Math.max(a.current, a.newAuto);
  return Math.max(0, a.current + a.newAuto - a.oldAuto);
}
