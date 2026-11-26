import { expect, test } from 'vitest';
import { ago, statusLabel } from './labels';

test('상태 문구', () => {
  expect(statusLabel('open')).toBe('접수 대기');
  expect(statusLabel('assigned')).toBe('배차됨');
  expect(statusLabel('arrived_pickup')).toBe('수락함');
  expect(statusLabel('driving')).toBe('운행 중');
  expect(statusLabel('completed')).toBe('완료');
  expect(statusLabel('cancelled')).toBe('취소');
});

test('기사 위치가 얼마 전 것인지', () => {
  const now = new Date('2026-11-19T03:00:00Z');
  expect(ago('2026-11-19T02:59:01Z', now)).toBe('방금');
  expect(ago('2026-11-19T02:55:00Z', now)).toBe('5분 전');
  expect(ago('2026-11-19T01:00:00Z', now)).toBe('2시간 전');
  expect(ago('2026-11-17T03:00:00Z', now)).toBe('2일 전');
});
