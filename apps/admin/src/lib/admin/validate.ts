export type FareBandInput = { max_km: number; fare: number };
export type SettingsInput = {
  release_min_takson: number;
  release_min_daeri: number;
  reservation_gap_min: number;
  unassigned_alert_min: number;
};
export type MissionInput = { name: string; extra_fare: number };

const isMoney = (n: number) => Number.isInteger(n) && n >= 0;

/** 요금표 검사. 문제가 없으면 null, 있으면 한국어 안내 문구 */
export function validateFareBands(rows: FareBandInput[]): string | null {
  if (rows.length === 0) return '요금 구간을 하나 이상 넣어 주세요.';
  for (const r of rows) {
    if (!Number.isFinite(r.max_km) || r.max_km <= 0) return '거리는 0보다 큰 숫자로 넣어 주세요.';
    if (!isMoney(r.fare)) return '요금은 0원 이상 정수로 넣어 주세요.';
  }
  const sorted = [...rows].sort((a, b) => a.max_km - b.max_km);
  for (const [i, cur] of sorted.entries()) {
    const prev = sorted[i - 1];
    if (!prev) continue;
    if (cur.max_km === prev.max_km) return '같은 거리 구간이 두 번 있어요.';
    if (cur.fare < prev.fare) return '먼 구간 요금이 가까운 구간보다 싸요.';
  }
  return null;
}

/** 운영 설정 검사: 모든 값이 1~240 정수 */
export function validateSettings(s: SettingsInput): string | null {
  const values = [s.release_min_takson, s.release_min_daeri, s.reservation_gap_min, s.unassigned_alert_min];
  if (values.some(v => !Number.isInteger(v) || v < 1 || v > 240)) return '시간은 1분에서 240분 사이로 넣어 주세요.';
  return null;
}

/** 미션 검사 */
export function validateMission(m: MissionInput): string | null {
  if (!m.name.trim()) return '미션 이름을 넣어 주세요.';
  if (!isMoney(m.extra_fare)) return '추가요금은 0원 이상 정수로 넣어 주세요.';
  return null;
}
