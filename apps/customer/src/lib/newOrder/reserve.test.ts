import { describe, expect, test } from 'vitest';
import { kstInputToIso } from './reserve';

test('한국 시간 입력을 서버 시각으로', () => {
  expect(kstInputToIso('2026-11-18', '14:00')).toBe('2026-11-18T05:00:00.000Z');
  expect(kstInputToIso('2026-11-19', '08:30')).toBe('2026-11-18T23:30:00.000Z');
});

test('잘못된 날짜·시간은 null', () => {
  expect(kstInputToIso('2026-13-01', '10:00')).toBeNull();
  expect(kstInputToIso('2026-02-30', '10:00')).toBeNull();
  expect(kstInputToIso('2026-11-18', '25:00')).toBeNull();
  expect(kstInputToIso('2026-11-18', '9시')).toBeNull();
  expect(kstInputToIso('', '')).toBeNull();
});

describe('defaultReserve: 예약 기본값은 지금부터 1시간 이상 남은 첫 정각 (한국 시간)', async () => {
  const { defaultReserve } = await import('./reserve');
  test('14:59에는 15:00(1분 뒤)이 아니라 16:00', () => {
    expect(defaultReserve(new Date('2026-11-19T05:59:00Z'))).toEqual({ date: '2026-11-19', time: '16:00' });
  });
  test('정각 14:00이면 15:00', () => {
    expect(defaultReserve(new Date('2026-11-19T05:00:00Z'))).toEqual({ date: '2026-11-19', time: '15:00' });
  });
  test('밤 23:30이면 다음 날 01:00', () => {
    expect(defaultReserve(new Date('2026-11-19T14:30:00Z'))).toEqual({ date: '2026-11-20', time: '01:00' });
  });
});
