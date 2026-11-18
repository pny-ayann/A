import { expect, test } from 'vitest';
import { resizeTarget } from './resize';

test('긴 변을 1600으로 줄인다', () => {
  expect(resizeTarget(4000, 3000)).toEqual({ width: 1600 });
  expect(resizeTarget(3000, 4000)).toEqual({ height: 1600 });
});

test('이미 작으면 그대로', () => {
  expect(resizeTarget(1200, 900)).toBeNull();
  expect(resizeTarget(1600, 1200)).toBeNull();
});

test('최대 크기를 바꿀 수 있다', () => {
  expect(resizeTarget(2000, 1000, 1000)).toEqual({ width: 1000 });
});
