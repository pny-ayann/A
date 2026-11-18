import { expect, test, vi } from 'vitest';

vi.mock('expo-location', () => ({ Accuracy: { Balanced: 3 } }));
const { shouldTrackInBackground, LOCATION_OPTIONS } = await import('./policy');

const base = { hasSession: true, activeOrderCount: 1, permission: 'granted' as const };

test('로그인·진행 중 1건·항상 허용이면 백그라운드로 보낸다', () => {
  expect(shouldTrackInBackground(base)).toBe(true);
});

test('진행 중 오더가 없으면 보내지 않는다', () => {
  expect(shouldTrackInBackground({ ...base, activeOrderCount: 0 })).toBe(false);
});

test('로그인이 풀리면 보내지 않는다', () => {
  expect(shouldTrackInBackground({ ...base, hasSession: false })).toBe(false);
});

test('항상 허용이 아니면 보내지 않는다', () => {
  expect(shouldTrackInBackground({ ...base, permission: 'denied' })).toBe(false);
  expect(shouldTrackInBackground({ ...base, permission: 'undetermined' })).toBe(false);
});

test('화면이 꺼져 있고 차가 멈춰 있어도 1분마다 위치를 보낸다 (움직인 거리 조건 없음)', () => {
  expect(LOCATION_OPTIONS.timeInterval).toBe(60_000);
  expect(LOCATION_OPTIONS.distanceInterval).toBe(0);
});
