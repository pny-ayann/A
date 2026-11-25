import { expect, test } from 'vitest';
import { isUnassignedOverdue, placeOf, STATUS_LABEL } from './labels';

const created = '2026-11-17T01:00:00Z';
const at = (min: number, base = created) => new Date(new Date(base).getTime() + min * 60_000);

test('일반 오더는 접수 11분 뒤 경고, 9분 뒤 아님', () => {
  const o = { status: 'open' as const, created_at: created, reserved_at: null };
  expect(isUnassignedOverdue(o, at(11), 10)).toBe(true);
  expect(isUnassignedOverdue(o, at(9), 10)).toBe(false);
});

test('예약 오더는 예약 9분 전부터 경고', () => {
  const reserved = '2026-11-17T05:00:00Z';
  const o = { status: 'open' as const, created_at: created, reserved_at: reserved };
  expect(isUnassignedOverdue(o, at(-9, reserved), 10)).toBe(true);
  expect(isUnassignedOverdue(o, at(-11, reserved), 10)).toBe(false);
});

test('배차된 오더는 경고 없음', () => {
  const o = { status: 'assigned' as const, created_at: created, reserved_at: null };
  expect(isUnassignedOverdue(o, at(60), 10)).toBe(false);
});

test('상태 한국어', () => {
  expect(STATUS_LABEL.arrived_pickup).toBe('출발지 도착');
  expect(STATUS_LABEL.open).toBe('접수');
  expect(STATUS_LABEL.cancelled).toBe('취소');
});

test('지역이 없으면 주소 앞 두 마디를 쓴다', () => {
  expect(placeOf('중구', '서울 중구 세종대로 110')).toBe('중구');
  expect(placeOf(null, '서울 강남구 강남대로 396')).toBe('서울 강남구');
  expect(placeOf('', '경기 용인시 기흥구 동백죽전대로 314')).toBe('경기 용인시');
});
