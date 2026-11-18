import { expect, test } from 'vitest';
import { nextAction, releaseRemainingMs } from './progress';

const none = { pickup: [], dropoff: [] };

test('배차됨 → 출발지 도착', () => {
  expect(nextAction('assigned', none, 0)).toEqual({ label: '출발지 도착', enabled: true, hint: null });
});

test('출발 사진이 모자라면 운행 시작 잠김', () => {
  expect(nextAction('arrived_pickup', { pickup: ['left', 'right'], dropoff: [] }, 0))
    .toEqual({ label: '운행 시작', enabled: false, hint: '출발 사진 2장이 더 필요해요' });
});

test('서버에 다 있지 않고 휴대폰에 대기 중이면 잠김', () => {
  expect(nextAction('arrived_pickup', { pickup: ['dashboard'], dropoff: [] }, 3))
    .toEqual({ label: '운행 시작', enabled: false, hint: '업로드 대기 3장' });
});

test('출발 사진이 서버에 다 있으면 운행 시작', () => {
  expect(nextAction('arrived_pickup', none, 0)).toEqual({ label: '운행 시작', enabled: true, hint: null });
});

test('운행 중 → 도착 완료 (도착 사진 기준)', () => {
  expect(nextAction('driving', { pickup: [], dropoff: ['front'] }, 0))
    .toEqual({ label: '도착 완료', enabled: false, hint: '도착 사진 1장이 더 필요해요' });
  expect(nextAction('driving', none, 0)).toEqual({ label: '도착 완료', enabled: true, hint: null });
});

test('끝났거나 취소됐거나 아직 안 잡은 오더는 버튼 없음', () => {
  expect(nextAction('completed', none, 0)).toBeNull();
  expect(nextAction('cancelled', none, 0)).toBeNull();
  expect(nextAction('open', none, 0)).toBeNull();
});

test('반납 남은 시간', () => {
  const s = { release_min_takson: 10, release_min_daeri: 5 };
  const at = '2026-11-17T03:00:00Z';
  expect(releaseRemainingMs(at, 'takson', s, new Date('2026-11-17T03:04:00Z'))).toBe(360000);
  expect(releaseRemainingMs(at, 'daeri', s, new Date('2026-11-17T03:06:00Z'))).toBe(0);
});

test('휴대폰 시계가 서버보다 늦어도 반납 시간은 정해진 분을 넘지 않는다', () => {
  const s = { release_min_takson: 10, release_min_daeri: 5 };
  expect(releaseRemainingMs('2026-11-17T03:00:00Z', 'takson', s, new Date('2026-11-17T02:59:55Z'))).toBe(600000);
});

test('도착 사진이 서버에 다 있어도 휴대폰에 올릴 사진·영수증이 남았으면 도착 완료 잠김', () => {
  expect(nextAction('driving', { pickup: [], dropoff: [] }, 2))
    .toEqual({ label: '도착 완료', enabled: false, hint: '업로드 대기 2장' });
});
