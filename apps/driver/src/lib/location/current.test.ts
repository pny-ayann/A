import { afterEach, expect, test, vi } from 'vitest';

vi.mock('expo-location', () => ({
  Accuracy: { Balanced: 3 },
  getForegroundPermissionsAsync: async () => ({ granted: true, canAskAgain: true }),
  requestForegroundPermissionsAsync: async () => ({ granted: true }),
  getLastKnownPositionAsync: async () => null,
  getCurrentPositionAsync: () => new Promise(() => {}), // 지하: 위치가 끝내 안 잡힘
}));
const { currentPosition } = await import('./current');

afterEach(() => { vi.useRealTimers(); });

test('위치가 안 잡히면 정한 시간(사진은 2초)만 기다리고 null', async () => {
  vi.useFakeTimers();
  let done: unknown = 'waiting';
  void currentPosition(2_000).then(v => { done = v; });
  await vi.advanceTimersByTimeAsync(2_000);
  expect(done).toBeNull();
});
