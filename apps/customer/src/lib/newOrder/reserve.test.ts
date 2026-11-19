import { expect, test } from 'vitest';
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
