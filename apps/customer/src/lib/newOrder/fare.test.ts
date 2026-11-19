import { describe, expect, test } from 'vitest';
import { fareState } from './fare';

const bands = [{ max_km: 10, fare: 25000 }, { max_km: 20, fare: 35000 }, { max_km: 40, fare: 50000 }];
const base = { km: null as number | null, routeFailed: false, bands, missionExtras: [] as number[], edited: null as number | null };

test('거리가 나오면 구간표로 자동 요금', () => {
  expect(fareState({ ...base, km: 12.3 })).toEqual({ fare: 35000, auto: 35000, note: null });
});

test('미션 추가 요금을 더한다', () => {
  expect(fareState({ ...base, km: 12.3, missionExtras: [5000, 3000] })).toEqual({ fare: 43000, auto: 43000, note: null });
});

test('고객이 고친 요금이 있으면 그 값', () => {
  expect(fareState({ ...base, km: 12.3, edited: 40000 })).toEqual({ fare: 40000, auto: 35000, note: null });
});

test('길찾기에 실패하면 접수를 막지 않고 직접 넣게 한다', () => {
  expect(fareState({ ...base, routeFailed: true })).toEqual({ fare: null, auto: null, note: '거리를 못 구했어요. 요금을 직접 넣어 주세요.' });
  expect(fareState({ ...base, routeFailed: true, edited: 30000 }).fare).toBe(30000);
});

test('아직 주소를 다 안 골랐으면 요금 없음', () => {
  expect(fareState(base)).toEqual({ fare: null, auto: null, note: null });
});

test('구간표가 비어 있으면 직접 넣게 한다', () => {
  expect(fareState({ ...base, km: 5, bands: [] })).toEqual({ fare: null, auto: null, note: '요금표가 없어요. 요금을 직접 넣어 주세요.' });
});

describe('amendDefaultFare: 배차 후 변경 요금 기본값은 지금 요금에서 출발한다', async () => {
  const { amendDefaultFare } = await import('./fare');
  test('미션 추가: 지금 요금 + 미션 추가요금 (자동 요금표와 무관)', () => {
    expect(amendDefaultFare({ current: 50000, reason: 'mission_added', missionExtra: 5000, oldAuto: 35000, newAuto: 40000 })).toBe(55000);
  });
  test('미션을 아직 안 골랐으면 비운다', () => {
    expect(amendDefaultFare({ current: 50000, reason: 'mission_added', missionExtra: null, oldAuto: null, newAuto: null })).toBeNull();
  });
  test('경로 변경: 협의된 요금 50,000에 자동 요금 차이(+5,000)만 더한다 (40,000으로 깎지 않는다)', () => {
    expect(amendDefaultFare({ current: 50000, reason: 'dropoff_change', missionExtra: null, oldAuto: 35000, newAuto: 40000 })).toBe(55000);
  });
  test('경로가 짧아지면 차이만큼 줄어든다', () => {
    expect(amendDefaultFare({ current: 50000, reason: 'dropoff_change', missionExtra: null, oldAuto: 40000, newAuto: 35000 })).toBe(45000);
  });
  test('예전 자동 요금을 모르면 지금 요금 아래로 내려가지 않는다', () => {
    expect(amendDefaultFare({ current: 50000, reason: 'waypoint_added', missionExtra: null, oldAuto: null, newAuto: 40000 })).toBe(50000);
    expect(amendDefaultFare({ current: 50000, reason: 'waypoint_added', missionExtra: null, oldAuto: null, newAuto: 60000 })).toBe(60000);
  });
  test('새 거리를 아직 모르면 비운다', () => {
    expect(amendDefaultFare({ current: 50000, reason: 'dropoff_change', missionExtra: null, oldAuto: 35000, newAuto: null })).toBeNull();
  });
});
