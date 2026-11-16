import { describe, expect, test } from 'vitest';
import { validateFareBands, validateMission, validateSettings } from './validate';

describe('validateFareBands', () => {
  test('같은 거리 구간이 두 번이면 오류', () => {
    expect(validateFareBands([{ max_km: 10, fare: 1 }, { max_km: 10, fare: 2 }])).toBe('같은 거리 구간이 두 번 있어요.');
  });
  test('먼 구간 요금이 더 싸면 오류 (입력 순서와 무관)', () => {
    expect(validateFareBands([{ max_km: 10, fare: 30000 }, { max_km: 30, fare: 20000 }])).toBe('먼 구간 요금이 가까운 구간보다 싸요.');
    expect(validateFareBands([{ max_km: 30, fare: 20000 }, { max_km: 10, fare: 30000 }])).toBe('먼 구간 요금이 가까운 구간보다 싸요.');
  });
  test('빈 목록은 오류', () => {
    expect(validateFareBands([])).toBe('요금 구간을 하나 이상 넣어 주세요.');
  });
  test('0 이하 거리, 음수 요금, 숫자가 아닌 값은 오류', () => {
    expect(validateFareBands([{ max_km: 0, fare: 1000 }])).toBe('거리는 0보다 큰 숫자로 넣어 주세요.');
    expect(validateFareBands([{ max_km: Number.NaN, fare: 1000 }])).toBe('거리는 0보다 큰 숫자로 넣어 주세요.');
    expect(validateFareBands([{ max_km: 10, fare: -1 }])).toBe('요금은 0원 이상 정수로 넣어 주세요.');
    expect(validateFareBands([{ max_km: 10, fare: 1000.5 }])).toBe('요금은 0원 이상 정수로 넣어 주세요.');
  });
  test('정상', () => {
    expect(validateFareBands([{ max_km: 10, fare: 20000 }, { max_km: 30, fare: 35000 }])).toBeNull();
  });
});

describe('validateSettings', () => {
  const ok = { release_min_takson: 10, release_min_daeri: 5, reservation_gap_min: 30, unassigned_alert_min: 10 };
  test('반납 시간 0분은 오류', () => {
    expect(validateSettings({ ...ok, release_min_takson: 0 })).toBe('시간은 1분에서 240분 사이로 넣어 주세요.');
  });
  test('241분, 소수, NaN은 오류', () => {
    expect(validateSettings({ ...ok, reservation_gap_min: 241 })).toBe('시간은 1분에서 240분 사이로 넣어 주세요.');
    expect(validateSettings({ ...ok, release_min_daeri: 2.5 })).toBe('시간은 1분에서 240분 사이로 넣어 주세요.');
    expect(validateSettings({ ...ok, unassigned_alert_min: Number.NaN })).toBe('시간은 1분에서 240분 사이로 넣어 주세요.');
  });
  test('정상', () => { expect(validateSettings(ok)).toBeNull(); });
});

describe('validateMission', () => {
  test('이름이 비면 오류', () => {
    expect(validateMission({ name: '  ', extra_fare: 0 })).toBe('미션 이름을 넣어 주세요.');
  });
  test('추가요금 음수는 오류', () => {
    expect(validateMission({ name: '세차', extra_fare: -100 })).toBe('추가요금은 0원 이상 정수로 넣어 주세요.');
  });
  test('정상', () => { expect(validateMission({ name: '세차', extra_fare: 10000 })).toBeNull(); });
});
